import { TRPCError } from '@trpc/server'
import { BrowserWindow, utilityProcess, type UtilityProcess } from 'electron'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

import type { ScanResult, ApplyReport } from '@ptt/converter-core'
import { getGame } from '@ptt/game-registry'
import { IPC_CHANNELS, type GameDefinition, type LanguageCode } from '@ptt/shared-types'

import { log } from '../log.js'
import type { OpenableRegistry } from './openable-registry.js'

export type JobEvent =
  | { type: 'scan-progress'; jobId: string; processed: number; total: number }
  | { type: 'apply-progress'; jobId: string; processed: number; total: number }
  | { type: 'scan-done'; jobId: string; result: ScanResult }
  | {
      type: 'plan-ready'
      jobId: string
      scannedCount: number
      sourceCount: number
      missingCount: number
    }
  | { type: 'done'; jobId: string; report: ApplyReport }
  | { type: 'error'; jobId: string; message: string }

interface RunInput {
  gameId: string
  rootDir: string
  sourceLanguage: LanguageCode
  targetLanguages: LanguageCode[]
  mode: 'add-to-current' | 'extract-to-folder'
  outputDir?: string | undefined
  overwrite?: boolean | undefined
}

interface JobState {
  worker: UtilityProcess
  game: GameDefinition
}

export class ConverterService {
  private jobs = new Map<string, JobState>()
  // One active job at a time. The IPC layer surfaces CONFLICT as a toast.
  private activeJobId: string | null = null

  constructor(
    private readonly workerPath: string,
    private readonly openable: OpenableRegistry
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
    const game = getGame(input.gameId)
    if (!game) throw new Error(`Unknown game id: ${input.gameId}`)

    const jobId = randomUUID()
    this.claimSlot(jobId)
    const worker = utilityProcess.fork(this.workerPath, [], { stdio: 'pipe' })
    this.jobs.set(jobId, { worker, game })
    this.attachWorkerLogging(worker, jobId)

    let terminated = false
    const finish = (terminalEvent?: JobEvent): void => {
      if (terminated) return
      terminated = true
      if (terminalEvent) this.broadcast(terminalEvent)
      worker.kill()
      this.releaseSlot(jobId)
    }

    worker.on('message', (msg: JobEvent) => {
      if (terminated) return
      if (msg.type === 'done') this.registerReportPaths(msg.report)
      this.broadcast(msg)
      if (msg.type === 'done' || msg.type === 'error') {
        finish()
      }
    })

    worker.once('exit', code => {
      // Same fail-safe as scan().
      finish({
        type: 'error',
        jobId,
        message: `Worker exited unexpectedly (code ${code ?? 'unknown'})`
      })
    })

    worker.postMessage({
      type: 'run',
      jobId,
      rootDir: input.rootDir,
      game,
      sourceLanguage: input.sourceLanguage,
      targetLanguages: input.targetLanguages,
      mode: input.mode,
      ...(input.outputDir !== undefined && { outputDir: input.outputDir }),
      ...(input.overwrite !== undefined && { overwrite: input.overwrite })
    })

    return { jobId }
  }

  cancel(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    job.worker.kill()
    this.releaseSlot(jobId)
    this.broadcast({ type: 'error', jobId, message: 'Job cancelled by user' })
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

  private registerReportPaths(report: ApplyReport): void {
    for (const list of Object.values(report.created)) {
      for (const p of list ?? []) this.openable.addFileAndParent(p)
    }
    for (const list of Object.values(report.overwritten)) {
      for (const p of list ?? []) this.openable.addFileAndParent(p)
    }
  }
}

export function createConverterService(openable: OpenableRegistry): ConverterService {
  const workerPath = join(__dirname, 'workers/converter.js')
  // Fail loud at boot if the worker bundle is missing.
  if (!existsSync(workerPath)) {
    throw new Error(`Worker bundle missing at ${workerPath}, build is corrupt`)
  }
  return new ConverterService(workerPath, openable)
}
