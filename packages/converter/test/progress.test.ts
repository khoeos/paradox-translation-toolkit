import { describe, expect, it } from 'vitest'

import { JOB_EVENT_TYPES, SCAN_PHASES, isJobEvent } from '../src/index.js'
import type { JobEvent } from '../src/index.js'

describe('isJobEvent', () => {
  it('accepts every known event type', () => {
    for (const type of JOB_EVENT_TYPES) {
      expect(isJobEvent({ type, jobId: 'j1' }), type).toBe(true)
    }
  })

  it('refuses an event type this build does not know', () => {
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

  it('covers the whole run, from progress to every terminal state', () => {
    expect(JOB_EVENT_TYPES).toContain('mod-progress')
    expect(JOB_EVENT_TYPES).toContain('scan-phase')
    expect(JOB_EVENT_TYPES).toContain('mods-scanned')
    expect(JOB_EVENT_TYPES).toContain('convert-done')
    expect(JOB_EVENT_TYPES).toContain('cancelled')
    expect(JOB_EVENT_TYPES).toContain('error')
  })
})

describe('SCAN_PHASES', () => {
  it('lists the phases of a scan in the order they run', () => {
    expect(SCAN_PHASES).toEqual([
      'reading-generated',
      'discovering',
      'building-coverage',
      'planning'
    ])
  })

  it('is carried by an event type the guard lets through', () => {
    for (const phase of SCAN_PHASES) {
      expect(isJobEvent({ type: 'scan-phase', jobId: 'j1', phase }), phase).toBe(true)
    }
  })
})
