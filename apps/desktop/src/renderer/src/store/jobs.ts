import i18next from 'i18next'
import { create } from 'zustand'

// The progress protocol lives in converter: it used to be declared here and in
// main/services/converter-service.ts byte for byte, with a guard loose enough that a variant
// added on one side fell through this switch in silence (audit findings Q-3, Q-6).
import type {
  ApplyReport,
  ConversionOutput,
  JobEvent,
  ScanOutput,
  TranslationProgress
} from '@ptt/converter'

export type { JobEvent }

export type JobStatus =
  | 'idle'
  | 'scanning'
  | 'processing-mods'
  | 'translating'
  | 'applying'
  | 'scan-finished'
  | 'done'
  | 'error'
  | 'cancelled'

export interface JobState {
  jobId: string
  status: JobStatus
  startedAt: number
  log: { ts: number; message: string }[]
  scanProcessed: number
  scanTotal: number
  applyProcessed: number
  applyTotal: number
  /** Mods handled so far, for the mod-level pipeline. */
  modsProcessed: number
  modsTotal: number
  /** Name of the mod being handled, so progress reads as more than a bar. */
  currentMod: string | null
  report: ApplyReport | null
  /** Result of a read-only scan over a whole collection. */
  scanOutput: ScanOutput | null
  /** Result of a conversion over a whole collection. */
  conversion: ConversionOutput | null
  translation: TranslationProgress | null
  errorMessage: string | null
}

interface JobsState {
  jobs: Map<string, JobState>
  activeJobId: string | null
  startJob: (jobId: string) => void
  applyEvent: (event: JobEvent) => void
  clearJob: (jobId: string) => void
  setActive: (jobId: string | null) => void
}

// Cap on stored job history. Long sessions used to grow this Map without
// bound (logs + ApplyReport for every job), eating memory.
const MAX_STORED_JOBS = 5
// How long to keep a finished job's data around so the user can still inspect
// the result modal after closing it. Cleared automatically afterwards.
const FINISHED_JOB_TTL_MS = 10 * 60 * 1000

const TERMINAL_STATUSES = new Set<JobStatus>(['done', 'error', 'cancelled'])

const blankJob = (jobId: string): JobState => ({
  jobId,
  status: 'scanning',
  startedAt: Date.now(),
  log: [{ ts: Date.now(), message: i18next.t('modal.log.startingScanning') }],
  scanProcessed: 0,
  scanTotal: 0,
  applyProcessed: 0,
  applyTotal: 0,
  modsProcessed: 0,
  modsTotal: 0,
  currentMod: null,
  report: null,
  scanOutput: null,
  conversion: null,
  translation: null,
  errorMessage: null
})

function evictOldest(jobs: Map<string, JobState>, activeJobId: string | null): void {
  while (jobs.size >= MAX_STORED_JOBS) {
    let evicted = false
    for (const id of jobs.keys()) {
      if (id === activeJobId) continue
      jobs.delete(id)
      evicted = true
      break
    }
    if (!evicted) return
  }
}

export const useJobsStore = create<JobsState>((set, get) => ({
  jobs: new Map(),
  activeJobId: null,

  startJob: jobId =>
    set(state => {
      // Idempotent: applyEvent may have already auto-created the JobState.
      if (state.jobs.has(jobId)) {
        return state.activeJobId === jobId ? state : { ...state, activeJobId: jobId }
      }
      const next = new Map(state.jobs)
      evictOldest(next, state.activeJobId)
      next.set(jobId, blankJob(jobId))
      return { jobs: next, activeJobId: jobId }
    }),

  applyEvent: event =>
    set(state => {
      const next = new Map(state.jobs)
      // Auto-create on first event with an unknown jobId (race with startJob).
      let existing = next.get(event.jobId)
      let activeJobId = state.activeJobId
      if (!existing) {
        evictOldest(next, activeJobId)
        existing = blankJob(event.jobId)
        next.set(event.jobId, existing)
        if (!activeJobId) activeJobId = event.jobId
      }
      const updated: JobState = { ...existing, log: [...existing.log] }

      switch (event.type) {
        case 'scan-progress':
          updated.status = 'scanning'
          updated.scanProcessed = event.processed
          updated.scanTotal = event.total
          break
        case 'apply-progress':
          updated.status = 'applying'
          updated.applyProcessed = event.processed
          updated.applyTotal = event.total
          break
        case 'scan-done':
          updated.log.push({
            ts: Date.now(),
            message: i18next.t('modal.log.filesScanned', { count: event.result.files.length })
          })
          break
        case 'plan-ready': {
          const now = Date.now()
          updated.log.push(
            {
              ts: now,
              message: i18next.t('modal.log.filesScanned', { count: event.scannedCount })
            },
            { ts: now, message: i18next.t('modal.log.sourceFiles', { count: event.sourceCount }) },
            { ts: now, message: i18next.t('modal.log.missingFiles', { count: event.missingCount }) }
          )
          break
        }
        case 'done':
          updated.status = 'done'
          updated.report = event.report
          updated.log.push({ ts: Date.now(), message: i18next.t('modal.log.conversionFinished') })
          break
        case 'error':
          updated.status = 'error'
          updated.errorMessage = event.message
          updated.log.push({
            ts: Date.now(),
            message: i18next.t('modal.log.errorPrefix', { message: event.message })
          })
          break
        case 'log':
          updated.log.push({ ts: Date.now(), message: event.message })
          break
        case 'mod-progress':
          updated.status = 'processing-mods'
          updated.modsProcessed = event.processed
          updated.modsTotal = event.total
          updated.currentMod = event.modName
          break
        case 'translate-progress':
          updated.status = 'translating'
          updated.translation = event.counters
          break
        case 'mods-scanned':
          updated.status = 'scan-finished'
          updated.scanOutput = event.output
          updated.log.push({
            ts: Date.now(),
            message: i18next.t('modal.log.modsScanned', { count: event.output.totals.mods })
          })
          break
        case 'convert-done':
          updated.status = 'done'
          updated.conversion = event.output
          updated.log.push({
            ts: Date.now(),
            message: i18next.t('modal.log.conversionFinished')
          })
          break
        case 'cancelled':
          updated.status = 'cancelled'
          updated.log.push({ ts: Date.now(), message: i18next.t('modal.log.cancelled') })
          break
      }

      next.set(event.jobId, updated)

      // Deferred clear once the job is terminal.
      if (TERMINAL_STATUSES.has(updated.status)) {
        setTimeout(() => {
          // Only clear if the user hasn't navigated back to this job.
          const current = get()
          if (current.activeJobId !== event.jobId) {
            current.clearJob(event.jobId)
          }
        }, FINISHED_JOB_TTL_MS)
      }

      return { jobs: next, activeJobId }
    }),

  clearJob: jobId =>
    set(state => {
      const next = new Map(state.jobs)
      next.delete(jobId)
      return {
        jobs: next,
        activeJobId: state.activeJobId === jobId ? null : state.activeJobId
      }
    }),

  setActive: jobId => set({ activeJobId: jobId })
}))

export { isJobEvent } from '@ptt/converter/progress'
