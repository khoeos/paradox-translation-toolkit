import { describe, expect, it } from 'vitest'

import { buildCoverage } from '../src/index.js'
import type { ModFolder } from '../src/index.js'
import { localeFile, stellarisDef } from './fixtures.js'
import { MemoryFs } from './memory-fs.js'

const mods = (...ids: string[]): ModFolder[] => ids.map(id => ({ id, path: id }))

describe('buildCoverage - declared dependency', () => {
  it('credits a localisation mod that declares a dependency on its target', async () => {
    const fs = new MemoryFs({
      'original/descriptor.mod': 'name="Ethics Overhaul"',
      'original/localisation/english/a_l_english.yml': localeFile('english', [
        ['K1', 'one'],
        ['K2', 'two']
      ]),
      'ru-patch/descriptor.mod': 'name="RU Patch"\ndependencies={ "Ethics Overhaul" }',
      'ru-patch/localisation/russian/a_l_russian.yml': localeFile('russian', [['K1', 'один']])
    })
    const coverage = await buildCoverage(mods('original', 'ru-patch'), stellarisDef, 'en', fs)
    expect(coverage.get('original')?.byLanguage.get('ru')).toEqual(new Set(['K1']))
    expect(coverage.get('original')?.sources).toEqual(['RU Patch'])
  })

  it('never credits a mod to itself', async () => {
    const fs = new MemoryFs({
      'solo/descriptor.mod': 'name="Solo"\ndependencies={ "Solo" }',
      'solo/localisation/english/a_l_english.yml': localeFile('english', [['K1', 'one']]),
      'solo/localisation/russian/a_l_russian.yml': localeFile('russian', [['K1', 'один']])
    })
    const coverage = await buildCoverage(mods('solo'), stellarisDef, 'en', fs)
    expect(coverage.has('solo')).toBe(false)
  })

  it('ignores a dependency naming an unknown mod', async () => {
    const fs = new MemoryFs({
      'patch/descriptor.mod': 'name="Patch"\ndependencies={ "Not Installed" }',
      'patch/localisation/russian/a_l_russian.yml': localeFile('russian', [['K1', 'один']])
    })
    const coverage = await buildCoverage(mods('patch'), stellarisDef, 'en', fs)
    expect(coverage.size).toBe(0)
  })

  it('never counts the source language as coverage', async () => {
    const fs = new MemoryFs({
      'original/descriptor.mod': 'name="Original"',
      'original/localisation/english/a_l_english.yml': localeFile('english', [['K1', 'one']]),
      'patch/descriptor.mod': 'name="Patch"\ndependencies={ "Original" }',
      'patch/localisation/english/a_l_english.yml': localeFile('english', [['K1', 'one']]),
      'patch/localisation/russian/a_l_russian.yml': localeFile('russian', [['K1', 'один']])
    })
    const coverage = await buildCoverage(mods('original', 'patch'), stellarisDef, 'en', fs)
    expect(coverage.get('original')?.byLanguage.has('en')).toBe(false)
    expect(coverage.get('original')?.byLanguage.get('ru')).toEqual(new Set(['K1']))
  })

  it('merges two patches of the same mod', async () => {
    const fs = new MemoryFs({
      'original/descriptor.mod': 'name="Original"',
      'original/localisation/english/a_l_english.yml': localeFile('english', [
        ['K1', 'one'],
        ['K2', 'two']
      ]),
      'p1/descriptor.mod': 'name="P1"\ndependencies={ "Original" }',
      'p1/localisation/russian/a_l_russian.yml': localeFile('russian', [['K1', 'один']]),
      'p2/descriptor.mod': 'name="P2"\ndependencies={ "Original" }',
      'p2/localisation/russian/a_l_russian.yml': localeFile('russian', [['K2', 'два']])
    })
    const coverage = await buildCoverage(mods('original', 'p1', 'p2'), stellarisDef, 'en', fs)
    expect(coverage.get('original')?.byLanguage.get('ru')).toEqual(new Set(['K1', 'K2']))
    expect(coverage.get('original')?.sources.toSorted()).toEqual(['P1', 'P2'])
  })
})

describe('buildCoverage - undeclared localisation mods', () => {
  it('credits a mod that ships no source language but repeats another mod keys', async () => {
    // Plenty of localisation mods never fill in dependencies. This is the case that made the
    // old file-level comparison overwrite a real Russian translation with English.
    const fs = new MemoryFs({
      'original/descriptor.mod': 'name="Original"',
      'original/localisation/english/a_l_english.yml': localeFile('english', [
        ['K1', 'one'],
        ['K2', 'two']
      ]),
      'ru-only/descriptor.mod': 'name="RU Only"',
      'ru-only/localisation/russian/a_l_russian.yml': localeFile('russian', [
        ['K1', 'один'],
        ['K2', 'два']
      ])
    })
    const coverage = await buildCoverage(mods('original', 'ru-only'), stellarisDef, 'en', fs)
    expect(coverage.get('original')?.byLanguage.get('ru')).toEqual(new Set(['K1', 'K2']))
  })

  it('needs half the patch keys to land on the same mod', async () => {
    const fs = new MemoryFs({
      'original/descriptor.mod': 'name="Original"',
      'original/localisation/english/a_l_english.yml': localeFile('english', [['K1', 'one']]),
      // Only 1 of 4 translated keys belongs to the original: below KEY_OVERLAP_MATCH.
      'ru-only/descriptor.mod': 'name="RU Only"',
      'ru-only/localisation/russian/a_l_russian.yml': localeFile('russian', [
        ['K1', 'один'],
        ['X1', 'x'],
        ['X2', 'y'],
        ['X3', 'z']
      ])
    })
    const coverage = await buildCoverage(mods('original', 'ru-only'), stellarisDef, 'en', fs)
    expect(coverage.has('original')).toBe(false)
  })

  it('does not apply the heuristic to a mod that has its own source language', async () => {
    // A normal mod translating itself is not a patch of anybody.
    const fs = new MemoryFs({
      'a/descriptor.mod': 'name="A"',
      'a/localisation/english/a_l_english.yml': localeFile('english', [['K1', 'one']]),
      'b/descriptor.mod': 'name="B"',
      'b/localisation/english/b_l_english.yml': localeFile('english', [['K1', 'one']]),
      'b/localisation/russian/b_l_russian.yml': localeFile('russian', [['K1', 'один']])
    })
    const coverage = await buildCoverage(mods('a', 'b'), stellarisDef, 'en', fs)
    expect(coverage.has('a')).toBe(false)
  })

  it('credits every mod the patch overlaps, not just one', async () => {
    const fs = new MemoryFs({
      'a/descriptor.mod': 'name="A"',
      'a/localisation/english/a_l_english.yml': localeFile('english', [['K1', 'one']]),
      'b/descriptor.mod': 'name="B"',
      'b/localisation/english/b_l_english.yml': localeFile('english', [['K1', 'one']]),
      'ru/descriptor.mod': 'name="RU"',
      'ru/localisation/russian/a_l_russian.yml': localeFile('russian', [['K1', 'один']])
    })
    const coverage = await buildCoverage(mods('a', 'b', 'ru'), stellarisDef, 'en', fs)
    expect(coverage.get('a')?.byLanguage.get('ru')).toEqual(new Set(['K1']))
    expect(coverage.get('b')?.byLanguage.get('ru')).toEqual(new Set(['K1']))
  })

  it('falls back to the folder id when the patch declares no name', async () => {
    const fs = new MemoryFs({
      'original/descriptor.mod': 'name="Original"',
      'original/localisation/english/a_l_english.yml': localeFile('english', [['K1', 'one']]),
      'ru-folder/localisation/russian/a_l_russian.yml': localeFile('russian', [['K1', 'один']])
    })
    const coverage = await buildCoverage(mods('original', 'ru-folder'), stellarisDef, 'en', fs)
    expect(coverage.get('original')?.sources).toEqual(['ru-folder'])
  })

  it('returns nothing for a collection with no localisation mod', async () => {
    const fs = new MemoryFs({
      'a/localisation/english/a_l_english.yml': localeFile('english', [['K1', 'one']])
    })
    const coverage = await buildCoverage(mods('a'), stellarisDef, 'en', fs)
    expect(coverage.size).toBe(0)
  })
})
