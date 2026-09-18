import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { JobEvent } from '@ptt/converter/progress'

import { keyProgressPercent, settledCount, useJobsStore } from './jobs.js'

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

describe('translation progress', () => {
  type TranslateMod = Extract<JobEvent, { type: 'translate-mod' }>

  const startTranslating = (over: Partial<TranslateMod> = {}): void => {
    store().applyEvent({
      type: 'translate-mod',
      jobId: 'j1',
      modName: 'Mod A',
      language: 'ru',
      total: 250,
      done: 0,
      ...over
    })
  }

  const progress = (translated: number, cached = 0, failed = 0): void => {
    store().applyEvent({
      type: 'translate-progress',
      jobId: 'j1',
      counters: { translated, cached, failed }
    })
  }

  it('names the mod as soon as it starts, before any mod has finished', () => {
    store().startJob('j1')
    startTranslating()
    const job = store().jobs.get('j1')
    expect(job?.status).toBe('translating')
    expect(job?.translatingMod).toEqual({ modName: 'Mod A', language: 'ru' })
  })

  it('adds up the announced totals, since mods translate two at a time', () => {
    store().startJob('j1')
    startTranslating({ total: 250 })
    startTranslating({ modName: 'Mod B', total: 40 })
    expect(store().jobs.get('j1')?.translationTotal).toBe(290)
  })

  it('counts every settled key against that running total', () => {
    store().startJob('j1')
    startTranslating({ total: 100 })
    progress(10, 5, 2)
    const job = store().jobs.get('j1')
    expect(settledCount(job?.translation ?? EMPTY)).toBe(17)
    expect(
      keyProgressPercent({
        translation: job?.translation ?? null,
        translationTotal: job?.translationTotal ?? 0
      })
    ).toBe(17)
  })

  it('is zero before anything was announced, rather than dividing by zero', () => {
    expect(
      keyProgressPercent({
        translation: { translated: 5, cached: 0, failed: 0 },
        translationTotal: 0
      })
    ).toBe(0)
    expect(keyProgressPercent({ translation: null, translationTotal: 10 })).toBe(0)
  })

  it('never reports more than a hundred percent', () => {
    expect(
      keyProgressPercent({
        translation: { translated: 999, cached: 0, failed: 0 },
        translationTotal: 10
      })
    ).toBe(100)
  })

  it('logs the mod it moves on to, which is the notable event in a long run', () => {
    store().startJob('j1')
    const before = store().jobs.get('j1')?.log.length ?? 0
    startTranslating()
    startTranslating({ modName: 'Mod B' })
    expect(store().jobs.get('j1')?.log.length).toBe(before + 2)
  })

  it('does not log every batch, only the mod changes', () => {
    store().startJob('j1')
    startTranslating()
    const after = store().jobs.get('j1')?.log.length ?? 0
    progress(10)
    progress(20)
    progress(30)
    expect(store().jobs.get('j1')?.log.length).toBe(after)
  })
})

const EMPTY = { translated: 0, cached: 0, failed: 0 }

describe('settledCount', () => {
  it('adds the three outcomes', () => {
    expect(settledCount({ translated: 3, cached: 4, failed: 5 })).toBe(12)
  })
})
