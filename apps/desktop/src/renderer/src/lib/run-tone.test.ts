import { describe, expect, it } from 'vitest'

import type { RunOutcome } from '@ptt/report'

import type { RunErrorCategory } from './run-errors.js'
import { getCountClasses, getErrorCategoryClasses, getOutcomeClasses } from './run-tone.js'

describe('getOutcomeClasses', () => {
  it('is green for a clean run', () => {
    expect(getOutcomeClasses('clean')).toEqual({ text: 'text-success', dot: 'bg-success' })
  })

  it('is amber for a run with issues', () => {
    expect(getOutcomeClasses('issues')).toEqual({ text: 'text-warning', dot: 'bg-warning' })
  })

  it('is red for a failed run', () => {
    expect(getOutcomeClasses('failed')).toEqual({
      text: 'text-destructive',
      dot: 'bg-destructive'
    })
  })

  it('is muted for a cancelled run', () => {
    expect(getOutcomeClasses('cancelled')).toEqual({
      text: 'text-muted-foreground',
      dot: 'bg-muted-foreground'
    })
  })

  it('covers every RunOutcome', () => {
    const outcomes: readonly RunOutcome[] = ['clean', 'issues', 'failed', 'cancelled']
    for (const outcome of outcomes) expect(getOutcomeClasses(outcome).text).toMatch(/^text-/)
  })
})

describe('getErrorCategoryClasses', () => {
  it('is red for blocked writes', () => {
    expect(getErrorCategoryClasses('blocked')).toEqual({ text: 'text-destructive' })
  })

  it('is sky for a missing header', () => {
    expect(getErrorCategoryClasses('header')).toEqual({ text: 'text-sky-500' })
  })

  it('is amber for unterminated values', () => {
    expect(getErrorCategoryClasses('unterminated')).toEqual({ text: 'text-warning' })
  })

  it('is muted for other messages', () => {
    expect(getErrorCategoryClasses('other')).toEqual({ text: 'text-muted-foreground' })
  })

  it('covers every RunErrorCategory', () => {
    const categories: readonly RunErrorCategory[] = ['blocked', 'header', 'unterminated', 'other']
    for (const category of categories)
      expect(getErrorCategoryClasses(category).text).toMatch(/^text-/)
  })
})

describe('getCountClasses', () => {
  it('is muted when the count is zero', () => {
    expect(getCountClasses(0, 'text-destructive')).toBe('text-muted-foreground')
  })

  it('uses the caller-supplied tone when the count is positive', () => {
    expect(getCountClasses(3, 'text-destructive')).toBe('text-destructive')
  })
})
