import i18next from 'i18next'
import { create } from 'zustand'

import type { ConversionOutput, JobEvent, ScanOutput, TranslationProgress } from '@ptt/converter'
import type { DiagnosticSeverity, ScanPhase, ScanRunningTotals } from '@ptt/converter/progress'

export type { JobEvent }

export interface LogEntry {
  ts: number
  message: string
  severity?: DiagnosticSeverity
}

export type JobStatus =
  | 'idle'
  | 'scanning'
  | 'processing-mods'
  | 'translating'
  | 'scan-finished'
  | 'done'
  | 'error'
  | 'cancelled'

export interface JobState {
  jobId: string
  status: JobStatus
  startedAt: number
  log: LogEntry[]
  modsProcessed: number
  modsTotal: number
  currentMod: string | null
  phase: ScanPhase | null
  phaseDone: number | null
  phaseTotal: number | null
  totals: ScanRunningTotals | null
  scanOutput: ScanOutput | null
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
  modsProcessed: 0,
  modsTotal: 0,
  currentMod: null,
  phase: null,
  phaseDone: null,
  phaseTotal: null,
  totals: null,
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
      if (
        event.type === 'scan-phase' &&
        existing.phase === event.phase &&
        existing.phaseDone === (event.done ?? null) &&
        existing.phaseTotal === (event.total ?? null)
      ) {
        return state
      }

      const updated: JobState = { ...existing, log: [...existing.log] }

      switch (event.type) {
        case 'error':
          updated.status = 'error'
          updated.errorMessage = event.message
          updated.log.push({
            ts: Date.now(),
            message: i18next.t('modal.log.errorPrefix', { message: event.message }),
            severity: 'error'
          })
          break
        case 'log':
          updated.log.push({
            ts: Date.now(),
            message: event.message,
            ...(event.severity ? { severity: event.severity } : {})
          })
          break
        case 'mod-progress':
          updated.status = 'processing-mods'
          updated.modsProcessed = event.processed
          updated.modsTotal = event.total
          updated.currentMod = event.modName
          if (event.totals) updated.totals = event.totals
          break
        case 'scan-phase':
          updated.phase = event.phase
          updated.phaseDone = event.done ?? null
          updated.phaseTotal = event.total ?? null
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
