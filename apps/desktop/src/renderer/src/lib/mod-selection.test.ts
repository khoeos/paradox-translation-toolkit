import { describe, expect, it } from 'vitest'

import type { ScannedMod } from '@ptt/converter'

import { selectedKeyCount } from './mod-selection.js'

const mod = (id: string, missingKeys: Record<string, number>): ScannedMod =>
  ({
    id,
    name: id,
    path: `/mods/${id}`,
    localisationFiles: 1,
    sourceFiles: 1,
    sourceKeys: 0,
    otherSpelling: false,
    coveredBy: [],
    missing: {},
    missingKeys,
    coveredKeys: {},
    englishKeys: {},
    keptKeys: {},
    shadowedKeys: {},
    missingFiles: 1,
    missingLines: 0,
    errors: []
  }) satisfies ScannedMod

const mods = [mod('a', { ru: 10, fr: 5 }), mod('b', { ru: 3 }), mod('c', { ru: 100 })]

describe('selectedKeyCount', () => {
  it('sums every target language of the selected mods', () => {
    expect(selectedKeyCount(mods, new Set(['a']))).toBe(15)
  })

  it('adds the selected mods together', () => {
    expect(selectedKeyCount(mods, new Set(['a', 'b']))).toBe(18)
  })

  it('ignores a mod that is not selected', () => {
    expect(selectedKeyCount(mods, new Set(['b']))).toBe(3)
  })

  it('is zero when nothing is selected', () => {
    expect(selectedKeyCount(mods, new Set())).toBe(0)
  })

  it('is zero when there is no mod at all', () => {
    expect(selectedKeyCount([], new Set(['a']))).toBe(0)
  })

  it('ignores an id that matches no scanned mod', () => {
    expect(selectedKeyCount(mods, new Set(['a', 'gone']))).toBe(15)
  })

  it('counts a mod with nothing missing as zero rather than skipping it', () => {
    expect(selectedKeyCount([mod('d', {})], new Set(['d']))).toBe(0)
  })
})
