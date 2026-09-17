import { describe, expect, it } from 'vitest'

import {
  isUpdaterEvent,
  UPDATER_EVENT_TYPES,
  UPDATER_STATUSES,
  type UpdaterEvent
} from '../src/updater.js'

describe('isUpdaterEvent', () => {
  it.each(UPDATER_EVENT_TYPES)('accepts a "%s" event', type => {
    expect(isUpdaterEvent({ type })).toBe(true)
  })

  it('rejects a type the main process never emits', () => {
    expect(isUpdaterEvent({ type: 'download-finished' })).toBe(false)
  })

  it('rejects anything that is not an object carrying a string type', () => {
    for (const value of [null, undefined, 'checking', 42, [], {}, { type: 1 }]) {
      expect(isUpdaterEvent(value), String(value)).toBe(false)
    }
  })

  it('covers every variant of the union, so a new one cannot be added silently', () => {
    const variants: UpdaterEvent[] = [
      { type: 'checking' },
      { type: 'available', version: '1.0.0', releaseNotes: null },
      { type: 'not-available', version: '1.0.0' },
      { type: 'download-progress', percent: 10 },
      { type: 'ready', version: '1.0.0' },
      { type: 'error', message: 'boom' },
      { type: 'redirected-to-browser', version: null }
    ]
    expect(variants.map(v => v.type)).toEqual([...UPDATER_EVENT_TYPES])
  })
})

describe('UPDATER_STATUSES', () => {
  it('holds no duplicate', () => {
    expect(new Set(UPDATER_STATUSES).size).toBe(UPDATER_STATUSES.length)
  })
})
