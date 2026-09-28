import { describe, expect, it } from 'vitest'

import type { JobEvent } from '@ptt/converter'

import { createTranslationStatus, formatDuration, formatEta } from './translation-status.js'

const SECOND = 1000
const MINUTE = 60 * SECOND

const mod = (over: Partial<Extract<JobEvent, { type: 'translate-mod' }>> = {}): JobEvent => ({
  type: 'translate-mod',
  jobId: 'cli',
  modId: 'a',
  modName: 'Mod A',
  language: 'tr',
  total: 120,
  pending: 100,
  done: 0,
  ...over
})

const modProgress = (done: number, runDone: number, finished = false): JobEvent => ({
  type: 'translate-mod-progress',
  jobId: 'cli',
  modId: 'a',
  language: 'tr',
  done,
  finished,
  runDone
})

describe('formatDuration', () => {
  it('shows minutes alone under an hour', () => {
    expect(formatDuration({ hours: 0, minutes: 45 })).toBe('45 min')
  })

  it('shows whole hours alone', () => {
    expect(formatDuration({ hours: 2, minutes: 0 })).toBe('2 h')
  })

  it('shows both otherwise', () => {
    expect(formatDuration({ hours: 1, minutes: 30 })).toBe('1 h 30 min')
  })
})

describe('formatEta', () => {
  it('words each shape of estimate', () => {
    expect(formatEta({ kind: 'estimating' })).toBe('estimating time left')
    expect(formatEta({ kind: 'under-a-minute' })).toBe('under a minute left')
    expect(formatEta({ kind: 'about', duration: { hours: 0, minutes: 5 } })).toBe(
      'about 5 min left'
    )
    expect(
      formatEta({
        kind: 'range',
        low: { hours: 1, minutes: 30 },
        high: { hours: 2, minutes: 15 }
      })
    ).toBe('1 h 30 min to 2 h 15 min left')
    expect(formatEta({ kind: 'at-least', duration: { hours: 3, minutes: 0 } })).toBe(
      'more than 3 h left'
    )
  })
})

describe('createTranslationStatus', () => {
  it('says nothing before the run announced a translation', () => {
    const status = createTranslationStatus()
    expect(status.apply({ type: 'log', jobId: 'cli', message: 'hi' }, 0)).toBe(false)
    expect(status.line(0)).toBeUndefined()
  })

  it('shows the counting pass mod by mod', () => {
    const status = createTranslationStatus()
    status.apply({ type: 'translate-counting', jobId: 'cli', done: 3, total: 12 }, 0)
    expect(status.line(0)).toBe('  counting the texts to translate  3/12 mods')
  })

  it('estimates the mod and the whole run once answers come back', () => {
    const status = createTranslationStatus()
    status.apply({ type: 'translate-workload', jobId: 'cli', total: 1000 }, 0)
    status.apply(mod(), 0)
    status.apply(modProgress(50, 50), MINUTE)

    const line = status.line(MINUTE) ?? ''
    expect(line).toContain('Mod A (tr) 50/100, ')
    expect(line).toContain('run 50/1 000, ')
    expect(line).not.toContain('estimating')
  })

  it('leads with the run and the wait, which clipping must not cut off', () => {
    const status = createTranslationStatus()
    status.apply({ type: 'translate-workload', jobId: 'cli', total: 1000 }, 0)
    status.apply(mod(), 0)
    status.apply({ type: 'translate-wait', jobId: 'cli', resumesAt: 40 * SECOND }, 0)

    const line = status.line(0) ?? ''
    expect(line.startsWith('  run 0/1 000, ')).toBe(true)
    expect(line.indexOf('rate limited')).toBeLessThan(line.indexOf('Mod A'))
  })

  it('stops showing a mod once it is finished', () => {
    const status = createTranslationStatus()
    status.apply({ type: 'translate-workload', jobId: 'cli', total: 100 }, 0)
    status.apply(mod(), 0)
    status.apply(modProgress(100, 100, true), MINUTE)
    expect(status.line(MINUTE)).not.toContain('Mod A')
  })

  it('counts down a rate-limit wait while it lasts', () => {
    const status = createTranslationStatus()
    status.apply({ type: 'translate-workload', jobId: 'cli', total: 100 }, 0)
    status.apply({ type: 'translate-wait', jobId: 'cli', resumesAt: 40 * SECOND }, 0)
    expect(status.line(0)).toContain('rate limited, retrying in 40 s')

    status.apply({ type: 'translate-wait', jobId: 'cli', resumesAt: null }, 40 * SECOND)
    expect(status.line(40 * SECOND)).not.toContain('rate limited')
  })
})
