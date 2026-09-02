import { TRPCError } from '@trpc/server'
import { BrowserWindow, utilityProcess, type UtilityProcess } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { ConversionOutput, JobEvent, TranslationMod } from '@ptt/converter'
import { isJobEvent } from '@ptt/converter/progress'
import { getGame } from '@ptt/games'
import {
  IPC_CHANNELS,
  type ConvertMode,
  type GameDefinition,
  type LanguageCode,
  type TargetContent
} from '@ptt/shared'
import type { TranslateConfig } from '@ptt/translate'

import { log } from '../log.js'
import { resolveGeneratedMod } from './generated-mod-paths.js'
import type { OpenableRegistry } from './openable-registry.js'

export type { JobEvent }

interface ScanModsInput {
  gameId: string
  rootDir: string
  sourceLanguage: LanguageCode
  targetLanguages: LanguageCode[]
  modName?: string | undefined
  translate?: TranslateConfig | undefined
}

interface ConvertInput extends ScanModsInput {
  mode: ConvertMode
  outputDir?: string | undefined
  selectedMods?: string[] | undefined
  targetContent?: TargetContent | undefined
}

interface JobState {
  worker: UtilityProcess
  game: GameDefinition
  cancelling?: boolean
  killTimer?: NodeJS.Timeout
  finish?: (terminalEvent?: JobEvent) => void
}

const CANCEL_GRACE_MS = 5_000

const TERMINAL_EVENTS = new Set<JobEvent['type']>([
  'error',
  'cancelled',
  'mods-scanned',
  'convert-done'
])

export class ConverterService {
  private jobs = new Map<string, JobState>()
  private activeJobId: string | null = null

  constructor(
    private readonly workerPath: string,
    private readonly openable: OpenableRegistry,
    private readonly userDataPath?: string,
    private readonly documentsPath?: string
  ) {}

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
        ...(input.targetContent !== undefined && { targetContent: input.targetContent }),
        ...(input.translate !== undefined && { translate: input.translate }),
        ...(generated !== undefined && {
          generatedMod: generated.mod,
          generatedModsDir: generated.modsDir
        })
      }
    })
  }

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
      if (msg.type === 'convert-done') this.registerConversionPaths(msg.output)
      this.broadcast(msg)
      if (TERMINAL_EVENTS.has(msg.type)) finish()
    })

    worker.once('exit', code => {
      finish({
        type: 'error',
        jobId,
        message: `Worker exited unexpectedly (code ${code ?? 'unknown'})`
      })
    })

    worker.postMessage(buildCommand(jobId, game))
    return { jobId }
  }

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
        supportedVersion: '*'
      }
    }
  }

  cancel(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    if (job.cancelling) return
    job.cancelling = true
    job.worker.postMessage({ type: 'cancel', jobId })
    job.killTimer = setTimeout(() => {
      log.warn(`[worker ${jobId}] did not acknowledge cancel in time, killing it`)
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
}

export function createConverterService(
  openable: OpenableRegistry,
  userDataPath?: string,
  documentsPath?: string
): ConverterService {
  const workerPath = join(__dirname, 'workers/converter.js')
  if (!existsSync(workerPath)) {
    throw new Error(`Worker bundle missing at ${workerPath}, build is corrupt`)
  }
  return new ConverterService(workerPath, openable, userDataPath, documentsPath)
}
