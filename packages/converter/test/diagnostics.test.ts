import { describe, expect, it } from 'vitest'

import type { Diagnostic } from '@ptt/parser'

import {
  DIAGNOSTIC_SEVERITIES,
  getParseSeverity,
  hasUnreadableContent,
  splitDiagnostics
} from '../src/index.js'
import type { ModDiagnostic } from '../src/index.js'

describe('getParseSeverity', () => {
  it.each([
    ['no-bom', 'warning'],
    ['no-header', 'warning'],
    ['expected-key', 'warning'],
    ['expected-colon', 'warning'],
    ['expected-quote', 'warning'],
    ['unterminated-string', 'error'],
    ['missing-header', 'error']
  ])('calls %s a %s', (code, severity) => {
    expect(getParseSeverity(code)).toBe(severity)
  })

  it('blocks on a code it does not know', () => {
    expect(getParseSeverity('some-future-code')).toBe('error')
  })

  it('has exactly the two severities the tuple declares', () => {
    expect(DIAGNOSTIC_SEVERITIES).toEqual(['warning', 'error'])
  })
})

const diagnostic = (code: string): Diagnostic => ({
  line: 1,
  col: 1,
  severity: 'error',
  code,
  message: code
})

describe('hasUnreadableContent', () => {
  it('ignores the codes the game ignores too', () => {
    expect(hasUnreadableContent([diagnostic('expected-colon'), diagnostic('no-header')])).toBe(
      false
    )
  })

  it('reports a file whose keys cannot be attributed', () => {
    expect(hasUnreadableContent([diagnostic('expected-colon'), diagnostic('missing-header')])).toBe(
      true
    )
  })
})

describe('splitDiagnostics', () => {
  it('keeps each message on its own side, in the order it was collected', () => {
    const diagnostics: ModDiagnostic[] = [
      { severity: 'warning', message: 'first line skipped' },
      { severity: 'error', message: 'EACCES' },
      { severity: 'warning', message: 'second line skipped' }
    ]
    expect(splitDiagnostics(diagnostics)).toEqual({
      errors: ['EACCES'],
      warnings: ['first line skipped', 'second line skipped']
    })
  })

  it('returns two empty lists for a mod that read clean', () => {
    expect(splitDiagnostics([])).toEqual({ errors: [], warnings: [] })
  })
})
