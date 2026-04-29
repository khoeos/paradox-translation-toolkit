import i18next from 'i18next'
import { create } from 'zustand'

import type { ApplyReport, ScanResult } from '@ptt/converter-core'

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

export type JobStatus = 'idle' | 'scanning' | 'applying' | 'done' | 'error' | 'cancelled'

export interface JobState {
  jobId: string
  status: JobStatus
  startedAt: number
  log: { ts: number; message: string }[]
  scanProcessed: number
  scanTotal: number
  applyProcessed: number
  applyTotal: number
  report: ApplyReport | null
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
  report: null,
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
          updated.status = event.message === 'Job cancelled by user' ? 'cancelled' : 'error'
          updated.errorMessage = event.message
          updated.log.push({
            ts: Date.now(),
            message: i18next.t('modal.log.errorPrefix', { message: event.message })
          })
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

export function isJobEvent(value: unknown): value is JobEvent {
  if (typeof value !== 'object' || value === null) return false
  const v = value as { type?: unknown; jobId?: unknown }
  return typeof v.type === 'string' && typeof v.jobId === 'string'
}
