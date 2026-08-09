import { TRPCError } from '@trpc/server'
import { BrowserWindow, utilityProcess, type UtilityProcess } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type {
  ApplyReport,
  ConversionOutput,
  JobEvent,
  ScanResult,
  TranslationMod
} from '@ptt/converter'
import { isJobEvent } from '@ptt/converter/progress'
import { getGame } from '@ptt/game-registry'
import {
  IPC_CHANNELS,
  type ConvertMode,
  type GameDefinition,
  type LanguageCode
} from '@ptt/shared'
import type { TranslateConfig } from '@ptt/translate'

import { log } from '../log.js'
import { resolveGeneratedMod } from './generated-mod-paths.js'
import type { OpenableRegistry } from './openable-registry.js'

export type { JobEvent }

interface RunInput {
  gameId: string
  rootDir: string
  sourceLanguage: LanguageCode
  targetLanguages: LanguageCode[]
  mode: ConvertMode
  outputDir?: string | undefined
  overwrite?: boolean | undefined
}

interface ScanModsInput {
  gameId: string
  rootDir: string
  sourceLanguage: LanguageCode
  targetLanguages: LanguageCode[]
  /** Name of the generated mod, so its own output is read back and excluded from the scan. */
  modName?: string | undefined
  translate?: TranslateConfig | undefined
}

interface ConvertInput extends ScanModsInput {
  mode: ConvertMode
  outputDir?: string | undefined
  selectedMods?: string[] | undefined
}

interface JobState {
  worker: UtilityProcess
  game: GameDefinition
  /** A cancel has been asked for, so a second click is a no-op. */
  cancelling?: boolean
  /** Fires only if the worker never acknowledges. */
  killTimer?: NodeJS.Timeout
  /**
   * The one way a job ends: broadcast a terminal event, kill the worker, free the slot.
   * Shared with `cancel` so a forced kill goes through the same `terminated` latch and the
   * worker's `exit` handler cannot follow it with a spurious `error`.
   */
  finish?: (terminalEvent?: JobEvent) => void
}

/** How long a worker gets to stop cleanly before it is killed. */
const CANCEL_GRACE_MS = 5_000

/** Events after which a worker has nothing left to say. */
const TERMINAL_EVENTS = new Set<JobEvent['type']>([
  'done',
  'error',
  'cancelled',
  'mods-scanned',
  'convert-done'
])

export class ConverterService {
  private jobs = new Map<string, JobState>()
  // One active job at a time. The IPC layer surfaces CONFLICT as a toast.
  private activeJobId: string | null = null

  constructor(
    private readonly workerPath: string,
    private readonly openable: OpenableRegistry,
    /** Where the memory, the glossary and the reports live. */
    private readonly userDataPath?: string,
    /** The user's Documents folder, needed to place the generated mod. */
    private readonly documentsPath?: string
  ) {}

  async scan(gameId: string, rootDir: string): Promise<ScanResult> {
    const game = getGame(gameId)
    if (!game) throw new Error(`Unknown game id: ${gameId}`)

    const jobId = randomUUID()
    this.claimSlot(jobId)
    const worker = utilityProcess.fork(this.workerPath, [], { stdio: 'pipe' })
    this.jobs.set(jobId, { worker, game })
    this.attachWorkerLogging(worker, jobId)

    return new Promise<ScanResult>((resolvePromise, rejectPromise) => {
      let settled = false
      const settle = (resolve: () => void): void => {
        if (settled) return
        settled = true
        resolve()
        worker.kill()
        this.releaseSlot(jobId)
      }

      worker.on('message', (msg: JobEvent) => {
        if (msg.jobId !== jobId) return
        if (msg.type === 'scan-done') {
          settle(() => resolvePromise(msg.result))
        } else if (msg.type === 'error') {
          settle(() => rejectPromise(new Error(msg.message)))
        }
      })

      worker.once('exit', code => {
        // Reject on silent worker death (crash, kill, OOM) so the Promise never hangs.
        settle(() =>
          rejectPromise(
            new Error(
              `Worker exited unexpectedly (code ${code ?? 'unknown'}) before scan completed`
            )
          )
        )
      })

      worker.postMessage({ type: 'scan', jobId, rootDir, game })
    })
  }

  run(input: RunInput): { jobId: string } {
    return this.startJob(input.gameId, (jobId, game) => ({
      type: 'run',
      jobId,
      rootDir: input.rootDir,
      game,
      sourceLanguage: input.sourceLanguage,
      targetLanguages: input.targetLanguages,
      mode: input.mode,
      ...(input.outputDir !== undefined && { outputDir: input.outputDir }),
      ...(input.overwrite !== undefined && { overwrite: input.overwrite })
    }))
  }

  /** Report what a whole collection is missing, key by key, writing nothing. */
  scanMods(input: ScanModsInput): { jobId: string } {
    return this.startJob(input.gameId, (jobId, game) => {
      const generated = this.generatedModFor(game, input.modName)
      return {
        type: 'scan-mods',
        jobId,
        rootDir: input.rootDir,
        game,
        sourceLanguage: input.sourceLanguage,
        targetLanguages: input.targetLanguages,
        userDataPath: this.userDataPath,
        ...(input.translate !== undefined && { translate: input.translate }),
        ...(generated !== undefined && { generatedMod: generated.mod })
      }
    })
  }

  /** Write the missing files, translating their values when a backend is configured. */
  convert(input: ConvertInput): { jobId: string } {
    return this.startJob(input.gameId, (jobId, game) => {
      const generated = this.generatedModFor(game, input.modName)
      return {
        type: 'convert',
        jobId,
        rootDir: input.rootDir,
        game,
        sourceLanguage: input.sourceLanguage,
        targetLanguages: input.targetLanguages,
        mode: input.mode,
        userDataPath: this.userDataPath,
        ...(input.outputDir !== undefined && { outputDir: input.outputDir }),
        ...(input.selectedMods !== undefined && { selectedMods: input.selectedMods }),
        ...(input.translate !== undefined && { translate: input.translate }),
        ...(generated !== undefined && {
          generatedMod: generated.mod,
          generatedModsDir: generated.modsDir
        })
      }
    })
  }

  /**
   * Fork a worker, forward its events to the renderer, and hand back the job id.
   *
   * The three long-running commands differ only in the message they post, so the lifecycle,
   * the terminal-event handling and the fail-safe on silent worker death live here once.
   */
  private startJob(
    gameId: string,
    buildCommand: (jobId: string, game: GameDefinition) => Record<string, unknown>
  ): { jobId: string } {
    const game = getGame(gameId)
    if (!game) throw new Error(`Unknown game id: ${gameId}`)

    const jobId = randomUUID()
    this.claimSlot(jobId)
    const worker = utilityProcess.fork(this.workerPath, [], { stdio: 'pipe' })
    const job: JobState = { worker, game }
    this.jobs.set(jobId, job)
    this.attachWorkerLogging(worker, jobId)

    let terminated = false
    const finish = (terminalEvent?: JobEvent): void => {
      if (terminated) return
      terminated = true
      if (terminalEvent) this.broadcast(terminalEvent)
      worker.kill()
      this.releaseSlot(jobId)
    }
    job.finish = finish

    worker.on('message', (msg: unknown) => {
      if (terminated) return
      if (!isJobEvent(msg) || msg.jobId !== jobId) return
      if (msg.type === 'done') this.registerReportPaths(msg.report)
      if (msg.type === 'convert-done') this.registerConversionPaths(msg.output)
      this.broadcast(msg)
      if (TERMINAL_EVENTS.has(msg.type)) finish()
    })

    worker.once('exit', code => {
      // Reject on silent worker death (crash, kill, OOM) so the UI never waits forever.
      finish({
        type: 'error',
        jobId,
        message: `Worker exited unexpectedly (code ${code ?? 'unknown'})`
      })
    })

    worker.postMessage(buildCommand(jobId, game))
    return { jobId }
  }

  /** Where the generated mod of a run goes, when the Documents folder is known. */
  private generatedModFor(
    game: GameDefinition,
    modName?: string
  ): { mod: TranslationMod; modsDir: string } | undefined {
    if (this.documentsPath === undefined) return undefined
    const paths = resolveGeneratedMod(this.documentsPath, game, modName)
    return {
      modsDir: paths.modsDir,
      mod: {
        name: paths.name,
        folder: paths.folder,
        path: paths.path,
        // Replaced by the version the source mods declare once the run knows them.
        supportedVersion: '*'
      }
    }
  }

  /**
   * Ask a run to stop after its current unit of work.
   *
   * A kill is the fallback, not the mechanism: the worker holds a translation memory buffer and
   * can have a request in flight, and killing it mid-flush used to leave a truncated JSON that
   * lost a whole language (audit finding S-8). It gets `CANCEL_GRACE_MS` to acknowledge.
   */
  cancel(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    if (job.cancelling) return
    job.cancelling = true
    job.worker.postMessage({ type: 'cancel', jobId })
    job.killTimer = setTimeout(() => {
      log.warn(`[worker ${jobId}] did not acknowledge cancel in time, killing it`)
      // Through `finish`, so the kill trips the same latch the worker's own terminal events do:
      // killing it directly left `terminated` false and the `exit` handler then broadcast an
      // "exited unexpectedly" error right after the cancel the user asked for.
      job.finish?.({ type: 'cancelled', jobId })
    }, CANCEL_GRACE_MS)
  }

  private claimSlot(jobId: string): void {
    if (this.activeJobId !== null) {
      throw new TRPCError({
        code: 'CONFLICT',
        message:
          'Another conversion job is already running. Wait for it to finish or cancel it first.'
      })
    }
    this.activeJobId = jobId
  }

  private releaseSlot(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (job?.killTimer) clearTimeout(job.killTimer)
    this.jobs.delete(jobId)
    if (this.activeJobId === jobId) this.activeJobId = null
  }

  private attachWorkerLogging(worker: UtilityProcess, jobId: string): void {
    worker.stdout?.on('data', (chunk: Buffer | string) => {
      log.info(`[worker ${jobId}] ${chunk.toString().trimEnd()}`)
    })
    worker.stderr?.on('data', (chunk: Buffer | string) => {
      log.error(`[worker ${jobId}] ${chunk.toString().trimEnd()}`)
    })
  }

  private broadcast(event: JobEvent): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_CHANNELS.jobEvent, event)
    }
  }

  private registerConversionPaths(output: ConversionOutput): void {
    for (const mod of output.mods) {
      for (const list of Object.values(mod.created)) {
        for (const p of list ?? []) this.openable.addFileAndParent(p)
      }
    }
    if (output.reportPath !== undefined) this.openable.addFileAndParent(output.reportPath)
    if (output.translationMod !== undefined)
      this.openable.addFileAndParent(output.translationMod.path)
  }

  private registerReportPaths(report: ApplyReport): void {
    for (const list of Object.values(report.created)) {
      for (const p of list ?? []) this.openable.addFileAndParent(p)
    }
    for (const list of Object.values(report.overwritten)) {
      for (const p of list ?? []) this.openable.addFileAndParent(p)
    }
  }
}

export function createConverterService(
  openable: OpenableRegistry,
  userDataPath?: string,
  documentsPath?: string
): ConverterService {
  const workerPath = join(__dirname, 'workers/converter.js')
  // Fail loud at boot if the worker bundle is missing.
  if (!existsSync(workerPath)) {
    throw new Error(`Worker bundle missing at ${workerPath}, build is corrupt`)
  }
  return new ConverterService(workerPath, openable, userDataPath, documentsPath)
}
