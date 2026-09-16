import { describe, expect, it } from 'vitest'

import {
  formatDateTime,
  formatSeconds,
  formatShortDate,
  formatTime,
  formatWeekdayDate,
  getDayBucket,
  getDayKey,
  getDaysAgo
} from './format-datetime.js'

const ISO = '2026-09-08T19:04:23.419Z'

describe('formatDateTime', () => {
  it('formats a full date and time for en-GB', () => {
    expect(formatDateTime(ISO, 'en-GB')).toBe(
      new Intl.DateTimeFormat('en-GB', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(ISO))
    )
  })

  it('formats a full date and time for fr-FR', () => {
    expect(formatDateTime(ISO, 'fr-FR')).toBe(
      new Intl.DateTimeFormat('fr-FR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }).format(new Date(ISO))
    )
  })

  it('reuses the same memoised formatter for repeat calls with the same locale', () => {
    expect(formatDateTime(ISO, 'en-GB')).toBe(formatDateTime(ISO, 'en-GB'))
  })
})

describe('formatTime', () => {
  it('formats just the time, en-GB', () => {
    expect(formatTime(ISO, 'en-GB')).toBe(
      new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' }).format(new Date(ISO))
    )
  })

  it('formats just the time, fr-FR', () => {
    expect(formatTime(ISO, 'fr-FR')).toBe(
      new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' }).format(new Date(ISO))
    )
  })
})

describe('formatShortDate', () => {
  it('formats day and month, en-GB', () => {
    expect(formatShortDate(ISO, 'en-GB')).toBe(
      new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(new Date(ISO))
    )
  })

  it('formats day and month, fr-FR', () => {
    expect(formatShortDate(ISO, 'fr-FR')).toBe(
      new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' }).format(new Date(ISO))
    )
  })
})

describe('formatSeconds', () => {
  it('renders whole seconds under a minute', () => {
    expect(formatSeconds(10)).toBe('10s')
  })

  it('renders 0 seconds', () => {
    expect(formatSeconds(0)).toBe('0s')
  })

  it('renders 59 seconds without switching to minutes', () => {
    expect(formatSeconds(59)).toBe('59s')
  })

  it('switches to minutes and seconds at 60', () => {
    expect(formatSeconds(60)).toBe('1 min 0s')
  })

  it('renders minutes and seconds for a longer run', () => {
    expect(formatSeconds(135)).toBe('2 min 15s')
  })
})

describe('formatWeekdayDate', () => {
  it('formats weekday, day and month, en-GB', () => {
    expect(formatWeekdayDate(ISO, 'en-GB')).toBe(
      new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(
        new Date(ISO)
      )
    )
  })

  it('formats weekday, day and month, fr-FR', () => {
    expect(formatWeekdayDate(ISO, 'fr-FR')).toBe(
      new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(
        new Date(ISO)
      )
    )
  })
})

describe('getDaysAgo', () => {
  const now = new Date(2026, 8, 8, 12, 0)

  it('is 0 for the same local day', () => {
    expect(getDaysAgo(new Date(2026, 8, 8, 23, 59).toISOString(), now)).toBe(0)
  })

  it('is 1 for the previous local day', () => {
    expect(getDaysAgo(new Date(2026, 8, 7, 0, 0).toISOString(), now)).toBe(1)
  })

  it('is 5 for five local days back', () => {
    expect(getDaysAgo(new Date(2026, 8, 3, 12, 0).toISOString(), now)).toBe(5)
  })
})

describe('getDayKey', () => {
  it('returns the local calendar day', () => {
    const local = new Date(2026, 8, 8, 23, 30)
    expect(getDayKey(local.toISOString())).toBe('2026-09-08')
  })

  it('pads single-digit months and days', () => {
    const local = new Date(2026, 0, 5, 10, 0)
    expect(getDayKey(local.toISOString())).toBe('2026-01-05')
  })
})

describe('getDayBucket', () => {
  const now = new Date(2026, 8, 8, 12, 0)

  it('buckets the same local day as today', () => {
    const sameDay = new Date(2026, 8, 8, 23, 59)
    expect(getDayBucket(sameDay.toISOString(), now)).toBe('today')
  })

  it('buckets the day before as yesterday', () => {
    const yesterday = new Date(2026, 8, 7, 23, 59)
    expect(getDayBucket(yesterday.toISOString(), now)).toBe('yesterday')
  })

  it('buckets a few days back as recent', () => {
    const recent = new Date(2026, 8, 5, 12, 0)
    expect(getDayBucket(recent.toISOString(), now)).toBe('recent')
  })

  it('buckets a week or more back as older', () => {
    const older = new Date(2026, 8, 1, 12, 0)
    expect(getDayBucket(older.toISOString(), now)).toBe('older')
  })

  it('crosses the local midnight boundary correctly: just after midnight is still today', () => {
    const justAfterMidnight = new Date(2026, 8, 8, 0, 1)
    expect(getDayBucket(justAfterMidnight.toISOString(), now)).toBe('today')
  })

  it('crosses the local midnight boundary correctly: just before midnight of the previous day is yesterday', () => {
    const justBeforeMidnight = new Date(2026, 8, 7, 23, 59, 59)
    expect(getDayBucket(justBeforeMidnight.toISOString(), now)).toBe('yesterday')
  })
})
