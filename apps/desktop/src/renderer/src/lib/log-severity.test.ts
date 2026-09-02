import { describe, expect, it } from 'vitest'

import type { DiagnosticSeverity } from '@ptt/converter/progress'

import { getLogSeverityStyle } from './log-severity.js'

const DIAGNOSTIC_SEVERITIES: readonly DiagnosticSeverity[] = ['warning', 'error']

describe('getLogSeverityStyle', () => {
  it('leaves a line the run said about itself unmarked', () => {
    const style = getLogSeverityStyle(undefined)
    expect(style.marker).toBe('')
    expect(style.className).toBe('')
  })

  it('gives every severity a marker, so colour is never the only signal', () => {
    for (const severity of DIAGNOSTIC_SEVERITIES) {
      expect(getLogSeverityStyle(severity).marker).not.toBe('')
    }
  })

  it('gives every severity a distinct marker and colour', () => {
    const markers = new Set(DIAGNOSTIC_SEVERITIES.map(s => getLogSeverityStyle(s).marker))
    const classes = new Set(DIAGNOSTIC_SEVERITIES.map(s => getLogSeverityStyle(s).className))
    expect(markers.size).toBe(DIAGNOSTIC_SEVERITIES.length)
    expect(classes.size).toBe(DIAGNOSTIC_SEVERITIES.length)
  })

  it('keeps the marker one character wide, so the messages stay aligned', () => {
    for (const severity of DIAGNOSTIC_SEVERITIES) {
      expect(getLogSeverityStyle(severity).marker).toHaveLength(1)
    }
  })

  it('reaches for design tokens rather than hardcoded colours', () => {
    for (const severity of DIAGNOSTIC_SEVERITIES) {
      expect(getLogSeverityStyle(severity).className).not.toMatch(/#|rgb|oklch/)
    }
  })
})
