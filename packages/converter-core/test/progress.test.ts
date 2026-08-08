import { describe, expect, it } from 'vitest'

import { JOB_EVENT_TYPES, isJobEvent } from '../src/index.js'
import type { JobEvent } from '../src/index.js'

describe('isJobEvent', () => {
  it('accepts every known event type', () => {
    for (const type of JOB_EVENT_TYPES) {
      expect(isJobEvent({ type, jobId: 'j1' }), type).toBe(true)
    }
  })

  it('refuses an event type this build does not know', () => {
    // The original guard only checked that `type` was a string, so a variant one side emitted
    // and the other did not handle fell through its switch in silence.
    expect(isJobEvent({ type: 'invented-later', jobId: 'j1' })).toBe(false)
  })

  it('refuses a message with no jobId', () => {
    expect(isJobEvent({ type: 'done' })).toBe(false)
  })

  it('refuses a non-object', () => {
    expect(isJobEvent(null)).toBe(false)
    expect(isJobEvent('done')).toBe(false)
    expect(isJobEvent(undefined)).toBe(false)
  })

  it('narrows to JobEvent so a caller can switch on the type', () => {
    const raw: unknown = { type: 'error', jobId: 'j1', message: 'boom' }
    if (!isJobEvent(raw)) throw new Error('should be a job event')
    const event: JobEvent = raw
    expect(event.type === 'error' && event.message).toBe('boom')
  })
})

describe('JOB_EVENT_TYPES', () => {
  it('has no duplicate', () => {
    expect(new Set(JOB_EVENT_TYPES).size).toBe(JOB_EVENT_TYPES.length)
  })

  it('covers both pipelines', () => {
    expect(JOB_EVENT_TYPES).toContain('apply-progress')
    expect(JOB_EVENT_TYPES).toContain('mods-scanned')
    expect(JOB_EVENT_TYPES).toContain('convert-done')
    expect(JOB_EVENT_TYPES).toContain('cancelled')
  })
})
