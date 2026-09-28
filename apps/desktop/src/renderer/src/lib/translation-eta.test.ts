import { describe, expect, it } from 'vitest'

import { formatDuration, formatEta, settledPercent } from './translation-eta.js'

const t = (key: string, options: Record<string, unknown>): string =>
  Object.keys(options).length === 0 ? key : `${key} ${JSON.stringify(options)}`

describe('formatDuration', () => {
  it('uses the minutes wording under an hour', () => {
    expect(formatDuration(t, { hours: 0, minutes: 45 })).toBe('modal.eta.minutes {"minutes":45}')
  })

  it('uses the hours wording for whole hours', () => {
    expect(formatDuration(t, { hours: 2, minutes: 0 })).toBe('modal.eta.hours {"hours":2}')
  })

  it('uses both otherwise', () => {
    expect(formatDuration(t, { hours: 1, minutes: 30 })).toBe(
      'modal.eta.hoursMinutes {"hours":1,"minutes":30}'
    )
  })
})

describe('formatEta', () => {
  it('has a wording for each shape of estimate', () => {
    expect(formatEta(t, { kind: 'estimating' })).toBe('modal.eta.estimating')
    expect(formatEta(t, { kind: 'under-a-minute' })).toBe('modal.eta.underAMinute')
    expect(formatEta(t, { kind: 'about', duration: { hours: 0, minutes: 5 } })).toContain(
      'modal.eta.about'
    )
    expect(formatEta(t, { kind: 'at-least', duration: { hours: 3, minutes: 0 } })).toContain(
      'modal.eta.atLeast'
    )
  })

  it('formats both ends of a range', () => {
    const text = formatEta(t, {
      kind: 'range',
      low: { hours: 0, minutes: 20 },
      high: { hours: 0, minutes: 30 }
    })
    expect(text).toContain('modal.eta.range')
    expect(text).toContain('{\\"minutes\\":20}')
    expect(text).toContain('{\\"minutes\\":30}')
  })
})

describe('settledPercent', () => {
  it('is the share settled so far', () => {
    expect(settledPercent(25, 100)).toBe(25)
  })

  it('stays within zero and a hundred', () => {
    expect(settledPercent(150, 100)).toBe(100)
    expect(settledPercent(-3, 100)).toBe(0)
  })

  it('is complete when there was nothing to settle', () => {
    expect(settledPercent(0, 0)).toBe(100)
  })
})
