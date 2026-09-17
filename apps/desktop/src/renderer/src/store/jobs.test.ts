import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { JobEvent } from '@ptt/converter/progress'

import { useJobsStore } from './jobs.js'

const reset = (): void => {
  useJobsStore.setState({ jobs: new Map(), activeJobId: null })
}

const store = () => useJobsStore.getState()

const scanned: JobEvent = {
  type: 'mods-scanned',
  jobId: 'j1',
  output: {
    mods: [],
    targets: [],
    totals: {
      mods: 0,
      missingFiles: 0,
      missingLines: 0,
      withoutLocalisation: 0,
      otherSpelling: 0,
      coveredKeys: 0,
      englishKeys: 0,
      keptKeys: 0,
      shadowedKeys: 0
    }

  }
}

beforeEach(() => {
  vi.useFakeTimers()
  reset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('startJob', () => {
  it('creates the job and makes it active', () => {
    store().startJob('j1')
    expect(store().activeJobId).toBe('j1')
    expect(store().jobs.get('j1')?.status).toBe('scanning')
  })

  it('is idempotent, since applyEvent may have created the job already', () => {
    store().applyEvent({ type: 'log', jobId: 'j1', message: 'early' })
    const before = store().jobs.get('j1')
    store().startJob('j1')
    expect(store().jobs.get('j1')).toBe(before)
    expect(store().activeJobId).toBe('j1')
  })

  it('caps the history and never evicts the active job', () => {
    for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g']) store().startJob(id)
    expect(store().jobs.size).toBeLessThanOrEqual(5)
    expect(store().jobs.has('g')).toBe(true)
    expect(store().activeJobId).toBe('g')
  })
})

describe('applyEvent', () => {
  it('auto-creates a job for an unknown id, racing startJob', () => {
    store().applyEvent({ type: 'mod-progress', jobId: 'x', processed: 1, total: 4, modName: 'M' })
    const job = store().jobs.get('x')
    expect(job?.status).toBe('processing-mods')
    expect(job?.modsProcessed).toBe(1)
    expect(store().activeJobId).toBe('x')
  })

  it('returns the very same state for a repeated scan-phase, so nothing re-renders', () => {
    store().startJob('j1')
    const phase: JobEvent = { type: 'scan-phase', jobId: 'j1', phase: 'discovering' }
    store().applyEvent(phase)
    const after = store().jobs
    store().applyEvent(phase)
    expect(store().jobs).toBe(after)
  })

  it('still applies a scan-phase whose counters moved', () => {
    store().startJob('j1')
    store().applyEvent({ type: 'scan-phase', jobId: 'j1', phase: 'planning', done: 1, total: 9 })
    store().applyEvent({ type: 'scan-phase', jobId: 'j1', phase: 'planning', done: 2, total: 9 })
    expect(store().jobs.get('j1')?.phaseDone).toBe(2)
  })

  it('records an error with its message and a log line', () => {
    store().startJob('j1')
    store().applyEvent({ type: 'error', jobId: 'j1', message: 'boom' })
    const job = store().jobs.get('j1')
    expect(job?.status).toBe('error')
    expect(job?.errorMessage).toBe('boom')
    expect(job?.log.at(-1)?.severity).toBe('error')
  })

  it('keeps the severity of a log event, and omits it when absent', () => {
    store().startJob('j1')
    store().applyEvent({ type: 'log', jobId: 'j1', message: 'plain' })
    store().applyEvent({ type: 'log', jobId: 'j1', message: 'warn', severity: 'warning' })
    const log = store().jobs.get('j1')?.log ?? []
    expect(log.at(-2)).not.toHaveProperty('severity')
    expect(log.at(-1)?.severity).toBe('warning')
  })

  it('does not mutate the previous job object', () => {
    store().startJob('j1')
    const before = store().jobs.get('j1')
    const logLength = before?.log.length
    store().applyEvent({ type: 'log', jobId: 'j1', message: 'later' })
    expect(before?.log.length).toBe(logLength)
  })
})

describe('terminal jobs', () => {
  it('clears a finished job once its time is up', () => {
    store().startJob('j1')
    store().startJob('j2')
    store().applyEvent(scanned)
    store().applyEvent({ type: 'cancelled', jobId: 'j1' })
    expect(store().jobs.has('j1')).toBe(true)

    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(store().jobs.has('j1')).toBe(false)
  })

  it('keeps a finished job the user came back to', () => {
    store().startJob('j1')
    store().applyEvent({ type: 'cancelled', jobId: 'j1' })
    store().setActive('j1')

    vi.advanceTimersByTime(10 * 60 * 1000)
    expect(store().jobs.has('j1')).toBe(true)
  })
})

describe('clearJob', () => {
  it('drops the job and unsets it as active', () => {
    store().startJob('j1')
    store().clearJob('j1')
    expect(store().jobs.size).toBe(0)
    expect(store().activeJobId).toBeNull()
  })

  it('leaves another job active', () => {
    store().startJob('j1')
    store().startJob('j2')
    store().clearJob('j1')
    expect(store().activeJobId).toBe('j2')
  })
})
