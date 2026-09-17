import { describe, expect, it } from 'vitest'

import type { GameTokens, TranslationTarget } from '@ptt/shared/languages'

import {
  buildTargetGrid,
  languageLabel,
  targetLabel,
  targetListError,
  targetListWarning,
  type TargetListContext,
  type Translate
} from './targets.js'

const t: Translate = (key, values) => {
  const match = /^languages\.(.+)$/.exec(key)
  if (match) return match[1]?.toUpperCase() ?? key
  return Object.entries(values).reduce<string>(
    (out, [name, value]) => out.replaceAll(`{{${name}}}`, String(value)),
    key
  )
}

const tokens: GameTokens = { en: 'english', fr: 'french', ru: 'russian' }

function context(over: Partial<TargetListContext> = {}): TargetListContext {
  return {
    targets: [],
    tokens,
    mode: 'create-translation-mod',
    targetContent: 'missing-keys',
    sourceLanguage: 'en',
    ...over
  }
}

describe('languageLabel', () => {
  it('renders a built-in code through the i18n catalogue', () => {
    expect(languageLabel(t, 'ru')).toBe('RU')
  })

  it('renders a free label verbatim', () => {
    expect(languageLabel(t, 'Catalan')).toBe('Catalan')
  })
})

describe('targetLabel', () => {
  it('is just the language name for a target using the game own token', () => {
    expect(targetLabel(t, { language: 'ru', fileToken: 'russian' }, tokens)).toBe('RU')
  })

  it('appends the token when it is not the language own', () => {
    expect(targetLabel(t, { language: 'tr', fileToken: 'english' }, tokens)).toBe(
      'converter.customTarget.badge'
    )
  })

  it('renders a free label as its badge form too', () => {
    expect(targetLabel(t, { language: 'Catalan', fileToken: 'english' }, tokens)).toBe(
      'converter.customTarget.badge'
    )
  })
})

describe('buildTargetGrid', () => {
  it('claims a language for the Switch when the target writes under its own token', () => {
    const grid = buildTargetGrid([{ language: 'ru', fileToken: 'russian' }], tokens)
    expect(grid.builtIn.get('ru')).toEqual({ language: 'ru', fileToken: 'russian' })
    expect(grid.extra).toEqual([])
    expect(grid.claimed.has('ru')).toBe(false)
  })

  it('keeps a shipped language written under a foreign token out of the grid, and marks it claimed', () => {
    const grid = buildTargetGrid([{ language: 'ru', fileToken: 'french' }], tokens)
    expect(grid.builtIn.has('ru')).toBe(false)
    expect(grid.extra).toEqual([{ language: 'ru', fileToken: 'french' }])
    expect(grid.claimed.has('ru')).toBe(true)
  })

  it('normalizes before it splits, so a spelled-out language claims its code', () => {
    const grid = buildTargetGrid([{ language: 'Russian', fileToken: 'french' }], tokens)
    expect(grid.claimed.has('ru')).toBe(true)
    expect(grid.extra).toEqual([{ language: 'ru', fileToken: 'french' }])
  })

  it('leaves a free label out of the grid without claiming a shipped language', () => {
    const grid = buildTargetGrid([{ language: 'Catalan', fileToken: 'english' }], tokens)
    expect(grid.builtIn.size).toBe(0)
    expect(grid.claimed).toEqual(new Set(['Catalan']))
  })
})

describe('targetListError', () => {
  it('is undefined for an empty list, which canRun already gates on', () => {
    expect(targetListError(t, context({ targets: [] }))).toBeUndefined()
  })

  it('is undefined for a valid list', () => {
    const targets: TranslationTarget[] = [{ language: 'ru', fileToken: 'russian' }]
    expect(targetListError(t, context({ targets }))).toBeUndefined()
  })

  it('flags an invalid language', () => {
    const targets: TranslationTarget[] = [{ language: 'a:b', fileToken: 'russian' }]
    expect(targetListError(t, context({ targets }))).toBe('converter.customTarget.invalidLanguage')
  })

  it('flags an invalid token', () => {
    const targets: TranslationTarget[] = [{ language: 'ru', fileToken: 'l_bad' }]
    expect(targetListError(t, context({ targets }))).toBe('converter.customTarget.invalidToken')
  })

  it('flags a token the game does not declare', () => {
    const targets: TranslationTarget[] = [{ language: 'ru', fileToken: 'klingon' }]
    expect(targetListError(t, context({ targets }))).toBe('converter.customTarget.unknownToken')
  })

  it('flags a duplicate language, spelled two ways', () => {
    const targets: TranslationTarget[] = [
      { language: 'ru', fileToken: 'russian' },
      { language: 'Russian', fileToken: 'french' }
    ]
    expect(targetListError(t, context({ targets }))).toBe('converter.customTarget.duplicateLang')
  })

  it('flags a duplicate token', () => {
    const targets: TranslationTarget[] = [
      { language: 'ru', fileToken: 'english' },
      { language: 'tr', fileToken: 'english' }
    ]
    expect(targetListError(t, context({ targets }))).toBe('converter.customTarget.duplicateToken')
  })

  it('allows a shadowing target : R3 no longer refuses it', () => {
    const targets: TranslationTarget[] = [{ language: 'tr', fileToken: 'english' }]
    expect(
      targetListError(
        t,
        context({ targets, mode: 'add-to-current', targetContent: 'complete-file' })
      )
    ).toBeUndefined()
  })

  it('flags an unrecognized language for RapidAPI, only when translate is enabled', () => {
    const targets: TranslationTarget[] = [{ language: 'Catalan', fileToken: 'french' }]
    expect(
      targetListError(t, context({ targets, provider: 'rapidapi', translateEnabled: true }))
    ).toBe('converter.customTarget.rapidapiUnsupported')
    expect(
      targetListError(t, context({ targets, provider: 'rapidapi', translateEnabled: false }))
    ).toBeUndefined()
  })

  it('allows a built-in language for RapidAPI', () => {
    const targets: TranslationTarget[] = [{ language: 'ru', fileToken: 'russian' }]
    expect(
      targetListError(t, context({ targets, provider: 'rapidapi', translateEnabled: true }))
    ).toBeUndefined()
  })

  it('flags the provable no-op : in-place, missing-keys, the source own token', () => {
    const targets: TranslationTarget[] = [{ language: 'Catalan', fileToken: 'english' }]
    expect(
      targetListError(
        t,
        context({
          targets,
          mode: 'add-to-current',
          targetContent: 'missing-keys',
          sourceLanguage: 'en'
        })
      )
    ).toBe('converter.customTarget.nothingToWrite')
  })

  it('does not flag the no-op outside add-to-current, or outside missing-keys', () => {
    const targets: TranslationTarget[] = [{ language: 'Catalan', fileToken: 'english' }]
    expect(targetListError(t, context({ targets, mode: 'create-translation-mod' }))).toBeUndefined()
    expect(
      targetListError(
        t,
        context({ targets, mode: 'add-to-current', targetContent: 'complete-file' })
      )
    ).toBeUndefined()
  })
})

describe('targetListWarning', () => {
  it('is undefined outside add-to-current, whatever the target list', () => {
    const targets: TranslationTarget[] = [{ language: 'Catalan', fileToken: 'french' }]
    expect(
      targetListWarning(t, context({ targets, mode: 'create-translation-mod' }))
    ).toBeUndefined()
  })

  it('is undefined outside missing-keys', () => {
    const targets: TranslationTarget[] = [{ language: 'Catalan', fileToken: 'french' }]
    expect(
      targetListWarning(
        t,
        context({ targets, mode: 'add-to-current', targetContent: 'complete-file' })
      )
    ).toBeUndefined()
  })

  it('returns the create-only text for missing-keys + shadowing, token not the source own', () => {
    const targets: TranslationTarget[] = [{ language: 'Catalan', fileToken: 'french' }]
    expect(
      targetListWarning(
        t,
        context({ targets, mode: 'add-to-current', targetContent: 'missing-keys' })
      )
    ).toBe('converter.customTarget.inPlaceCreateOnly')
  })

  it('is undefined for the provable no-op, which is for targetListError to report', () => {
    const targets: TranslationTarget[] = [{ language: 'Catalan', fileToken: 'english' }]
    expect(
      targetListWarning(
        t,
        context({
          targets,
          mode: 'add-to-current',
          targetContent: 'missing-keys',
          sourceLanguage: 'en'
        })
      )
    ).toBeUndefined()
  })

  it('is undefined for a target that already uses its own token', () => {
    const targets: TranslationTarget[] = [{ language: 'ru', fileToken: 'russian' }]
    expect(
      targetListWarning(
        t,
        context({ targets, mode: 'add-to-current', targetContent: 'missing-keys' })
      )
    ).toBeUndefined()
  })
})
