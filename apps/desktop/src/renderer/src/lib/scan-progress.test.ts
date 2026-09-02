import { describe, expect, it } from 'vitest'

import { SCAN_PHASES } from '@ptt/converter/progress'

import { formatElapsed, scanPhasePercent } from './scan-progress.js'

describe('scanPhasePercent', () => {
  it('sits at the start of the band for a phase that counts nothing', () => {
    expect(scanPhasePercent('reading-generated', null, null)).toBe(2)
    expect(scanPhasePercent('discovering', null, null)).toBe(8)
  })

  it('interpolates inside the band of a phase that counts', () => {
    expect(scanPhasePercent('building-coverage', 0, 240)).toBe(15)
    expect(scanPhasePercent('building-coverage', 120, 240)).toBe(35)
    expect(scanPhasePercent('building-coverage', 240, 240)).toBe(55)
  })

  it('ends the last phase at 100', () => {
    expect(scanPhasePercent('planning', 240, 240)).toBe(100)
  })

  it('never goes backwards from one phase to the next', () => {
    let previous = 0
    for (const phase of SCAN_PHASES) {
      const start = scanPhasePercent(phase, null, null)
      expect(start).toBeGreaterThanOrEqual(previous)
      previous = scanPhasePercent(phase, 1, 1)
    }
  })

  it('starts above zero, so the bar never reads as broken', () => {
    for (const phase of SCAN_PHASES) {
      expect(scanPhasePercent(phase, null, null)).toBeGreaterThan(0)
    }
  })

  it('survives a total of zero rather than dividing by it', () => {
    expect(scanPhasePercent('planning', 0, 0)).toBe(55)
  })

  it('clamps a count that overshoots its total', () => {
    expect(scanPhasePercent('planning', 300, 240)).toBe(100)
  })
})

describe('formatElapsed', () => {
  it('shows minutes and seconds', () => {
    expect(formatElapsed(42_000)).toBe('0:42')
    expect(formatElapsed(135_000)).toBe('2:15')
  })

  it('pads the seconds only', () => {
    expect(formatElapsed(65_000)).toBe('1:05')
  })

  it('adds hours once there are any', () => {
    expect(formatElapsed(3_849_000)).toBe('1:04:09')
  })

  it('is zero at the start and never negative', () => {
    expect(formatElapsed(0)).toBe('0:00')
    expect(formatElapsed(-5000)).toBe('0:00')
  })
})
