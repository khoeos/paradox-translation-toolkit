import { describe, expect, it } from 'vitest'

import type { GameTokens } from '@ptt/shared/languages'

import { deriveLegacyTargetLanguages, resolveStoredTargets } from './useSettingsSync.js'

const tokens: GameTokens = { en: 'english', fr: 'french', tr: 'turkish' }

describe('resolveStoredTargets', () => {
  it('uses the stored target list when there is one', () => {
    const targets = resolveStoredTargets(
      'stellaris',
      { stellaris: [{ language: 'ru', fileToken: 'russian' }] },
      {},
      tokens
    )
    expect(targets).toEqual([{ language: 'ru', fileToken: 'russian' }])
  })

  it('normalizes a stored free-text label, so the store never holds an unnormalized target', () => {
    const targets = resolveStoredTargets(
      'stellaris',
      { stellaris: [{ language: 'Turkish', fileToken: 'turkish' }] },
      {},
      tokens
    )
    expect(targets).toEqual([{ language: 'tr', fileToken: 'turkish' }])
  })

  it('falls back to the built-in targets derived from the legacy key', () => {
    const targets = resolveStoredTargets('stellaris', {}, { stellaris: ['fr', 'tr'] }, tokens)
    expect(targets).toEqual([
      { language: 'fr', fileToken: 'french' },
      { language: 'tr', fileToken: 'turkish' }
    ])
  })

  it('drops a legacy language the game ships no token for', () => {
    const targets = resolveStoredTargets('stellaris', {}, { stellaris: ['fr', 'ko'] }, tokens)
    expect(targets).toEqual([{ language: 'fr', fileToken: 'french' }])
  })

  it('is an empty list when nothing is stored', () => {
    expect(resolveStoredTargets('stellaris', {}, {}, tokens)).toEqual([])
  })
})

describe('deriveLegacyTargetLanguages', () => {
  it('keeps only the built-in codes', () => {
    const derived = deriveLegacyTargetLanguages([
      { language: 'ru', fileToken: 'russian' },
      { language: 'Catalan', fileToken: 'english' }
    ])
    expect(derived).toEqual(['ru'])
  })

  it('yields an empty list for a Catalan-only target list, so the patch still validates', () => {
    expect(deriveLegacyTargetLanguages([{ language: 'Catalan', fileToken: 'english' }])).toEqual([])
  })

  it('dedupes', () => {
    const derived = deriveLegacyTargetLanguages([
      { language: 'ru', fileToken: 'russian' },
      { language: 'ru', fileToken: 'mylang' }
    ])
    expect(derived).toEqual(['ru'])
  })
})
