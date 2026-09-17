import { describe, expect, it } from 'vitest'

import en from '@ptt/i18n/locales/en'

import { getRefusalReasonLabel, type Translate } from './refusal-reasons.js'

const t: Translate = (key, options) => {
  const entries = Object.entries(options)
  if (entries.length === 0) return key
  return entries.reduce<string>((out, [name, value]) => `${out} {{${name}}}=${String(value)}`, key)
}

const KNOWN_REASONS = ['markup', 'empty', 'backend', 'control', 'identical'] as const

describe('getRefusalReasonLabel', () => {
  const reasonLabels: Record<string, string> = en.runs.report.refusals.reasons

  it.each(KNOWN_REASONS)('has a non-empty extracted i18n value for %s', reason => {
    expect(reasonLabels[reason], reason).toBeTruthy()
  })

  it.each(KNOWN_REASONS)('maps %s to its own i18n key', reason => {
    expect(getRefusalReasonLabel(t, reason)).toBe(`runs.report.refusals.reasons.${reason}`)
  })

  it('falls back to a generic key for a reason it does not recognize, carrying the reason along', () => {
    expect(getRefusalReasonLabel(t, 'rate-limited')).toBe(
      'runs.report.refusals.reasons.unknown {{reason}}=rate-limited'
    )
  })
})
