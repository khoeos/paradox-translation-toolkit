import { createInstance } from 'i18next'
import { describe, expect, it } from 'vitest'

import {
  DEFAULT_UI_LANGUAGE,
  initI18n,
  resources,
  UI_LANGUAGES,
  VALID_UI_LANGUAGES
} from '../src/index.js'

describe('@ptt/i18n', () => {
  it('UI_LANGUAGES is consistent with VALID_UI_LANGUAGES', () => {
    expect(UI_LANGUAGES.map(l => l.code)).toEqual([...VALID_UI_LANGUAGES])
  })

  it('every valid language has a translation resource', () => {
    for (const code of VALID_UI_LANGUAGES) {
      expect(resources).toHaveProperty(`${code}.translation`)
    }
  })

  it('uses English as the default', () => {
    expect(DEFAULT_UI_LANGUAGE).toBe('en')
  })

  it('exposes resources for each language', () => {
    expect(resources).toHaveProperty('en.translation')
    expect(resources).toHaveProperty('fr.translation')
  })

  it('initialises an isolated instance and translates a simple key', () => {
    const inst = createInstance()
    initI18n({ lng: 'en', instance: inst })
    expect(inst.t('header.nav.converter')).toBe('Converter')
  })

  it('translates the same key in French', () => {
    const inst = createInstance()
    initI18n({ lng: 'fr', instance: inst })
    expect(inst.t('header.nav.converter')).toBe('Convertisseur')
  })

  it('supports interpolation', () => {
    const inst = createInstance()
    initI18n({ lng: 'en', instance: inst })
    expect(inst.t('updater.statuses.available', { version: '3.1.0' })).toBe(
      'Update available: 3.1.0'
    )
  })

  it('falls back to English for missing keys', () => {
    const inst = createInstance()
    initI18n({ lng: 'fr', instance: inst })
    // Non-existing key returns the key itself by default
    expect(inst.t('does.not.exist')).toBe('does.not.exist')
  })

  it('falls back to English when a value is empty in another locale', () => {
    const inst = createInstance()
    initI18n({ lng: 'fr', instance: inst })
    // Inject a controlled empty-fr / non-empty-en pair under a throwaway
    // namespace so we can clean up afterwards without leaking into the
    // shared `resources` const used by the parity check.
    const NS = '__empty_fallback_test'
    inst.addResourceBundle('en', NS, { greeting: 'English fallback' })
    inst.addResourceBundle('fr', NS, { greeting: '' })
    try {
      expect(inst.t('greeting', { ns: NS })).toBe('English fallback')
    } finally {
      inst.removeResourceBundle('en', NS)
      inst.removeResourceBundle('fr', NS)
    }
  })

  it('parity check - every key in English exists in every other locale', () => {
    // Skip CLDR-plural-suffixed keys: i18next-cli auto-emits them per locale
    // (en gets _one/_other ; fr gets _one/_many/_other ; zh gets _other only,
    // by CLDR rules). It's correct for some locales to be missing certain
    // plural variants, so we exclude them from the parity check.
    const PLURAL_SUFFIXES = ['_zero', '_one', '_two', '_few', '_many', '_other']
    const isPluralKey = (k: string): boolean => PLURAL_SUFFIXES.some(s => k.endsWith(s))
    const enKeys = collectKeys(resources.en.translation).filter(k => !isPluralKey(k))
    const offenders: Record<string, string[]> = {}
    for (const code of VALID_UI_LANGUAGES) {
      if (code === 'en') continue
      const localeKeys = new Set(
        collectKeys((resources as Record<string, { translation: unknown }>)[code]!.translation)
      )
      const missing = enKeys.filter(k => !localeKeys.has(k))
      if (missing.length > 0) offenders[code] = missing
    }
    expect(offenders).toEqual({})
  })
})

function collectKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj !== 'object' || obj === null) return [prefix]
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    collectKeys(v, prefix ? `${prefix}.${k}` : k)
  )
}
