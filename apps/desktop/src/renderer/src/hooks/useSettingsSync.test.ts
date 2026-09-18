import { describe, expect, it } from 'vitest'

import type { GameTokens } from '@ptt/shared/languages'

import { TRANSLATE_DEFAULTS } from '@ptt/translate/defaults'

import type { PersistedTranslate } from '@renderer/store/converter-form'

import {
  deriveLegacyTargetLanguages,
  fromStoredTranslate,
  resolveStoredTargets,
  toStoredTranslate,
  translateChanged
} from './useSettingsSync.js'


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

const translate = (over: Partial<PersistedTranslate> = {}): PersistedTranslate => ({
  ...TRANSLATE_DEFAULTS,
  ...over
})

describe('toStoredTranslate', () => {
  it('files the current endpoint under the current provider', () => {
    const stored = toStoredTranslate(
      translate({ provider: 'openai', baseUrl: 'http://localhost:1234/v1', model: 'qwen3-8b' }),
      {}
    )
    expect(stored.provider).toBe('openai')
    expect(stored.backends.openai).toEqual({
      baseUrl: 'http://localhost:1234/v1',
      model: 'qwen3-8b'
    })
  })

  it('leaves the other providers alone', () => {
    const stored = toStoredTranslate(translate({ provider: 'openai', baseUrl: 'u', model: 'm' }), {
      ollama: { baseUrl: 'http://localhost:11434', model: 'qwen2.5:7b' }
    })
    expect(stored.backends.ollama).toEqual({
      baseUrl: 'http://localhost:11434',
      model: 'qwen2.5:7b'
    })
  })

  it('carries the request sizing, which is what nobody wants to retype', () => {
    const stored = toStoredTranslate(translate({ batchSize: 50, concurrency: 4 }), {})
    expect(stored.batchSize).toBe(50)
    expect(stored.concurrency).toBe(4)
  })

  it('never carries the API key', () => {
    const stored = toStoredTranslate(translate(), {})
    expect(JSON.stringify(stored)).not.toContain('apiKey')
  })
})

describe('fromStoredTranslate', () => {
  it('round-trips what toStoredTranslate wrote', () => {
    const before = translate({
      provider: 'openai',
      baseUrl: 'http://localhost:1234/v1',
      model: 'qwen3-8b',
      batchSize: 50
    })
    const { translate: after, backends } = fromStoredTranslate(toStoredTranslate(before, {}))
    expect(after.provider).toBe('openai')
    expect(after.batchSize).toBe(50)
    expect(backends.openai).toEqual({ baseUrl: 'http://localhost:1234/v1', model: 'qwen3-8b' })
  })

  it('leaves the endpoint to the store, which resolves it from the provider', () => {
    const { translate: after } = fromStoredTranslate(toStoredTranslate(translate(), {}))
    expect('baseUrl' in after).toBe(false)
    expect('model' in after).toBe(false)
  })
})

describe('translateChanged', () => {
  it.each(['enabled', 'provider', 'baseUrl', 'model', 'batchSize', 'concurrency'] as const)(
    'notices a change of %s',
    key => {
      const before = translate()
      const after = translate({
        [key]: typeof before[key] === 'number' ? Number(before[key]) + 1 : `${String(before[key])}x`
      })
      expect(translateChanged(before, after)).toBe(true)
    }
  )

  it('ignores a field that is persisted elsewhere', () => {
    expect(translateChanged(translate(), translate({ gamePath: '/games/stellaris' }))).toBe(false)
  })

  it('is false for an untouched config', () => {
    expect(translateChanged(translate(), translate())).toBe(false)
  })
})
