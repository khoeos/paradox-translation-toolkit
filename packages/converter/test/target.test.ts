import { describe, expect, it } from 'vitest'

import { buildFilename, parseFilename } from '@ptt/parser'
import type { LanguageCode, TranslationTarget } from '@ptt/shared'
import { findTargetListIssue, isFileToken } from '@ptt/shared/languages'

import { describeInPlaceShadowing, resolveTargets } from '../src/index.js'
import type { GameContextRef, ResolvedTarget } from '../src/index.js'
import { stellarisDef } from './fixtures.js'

const withTurkish: GameContextRef = {
  ...stellarisDef,
  languageFileToken: { ...stellarisDef.languageFileToken, tr: 'turkish' }
}

const target = (language: string, fileToken: string): TranslationTarget => ({
  language,
  fileToken
})

const resolve = (
  targets: readonly TranslationTarget[],
  gameDef: GameContextRef = stellarisDef,
  sourceLanguage: LanguageCode = 'en'
): ReturnType<typeof resolveTargets> => resolveTargets(gameDef, sourceLanguage, targets)

describe('the file token grammar survives the filename round trip', () => {
  const accepted = [
    'english',
    'russian',
    'simp_chinese',
    'braz_por',
    'mylang',
    'my_lang',
    'l',
    'll_l',
    '_leading',
    'trailing_'
  ]

  it.each(accepted)('accepts "%s" and parses it back unchanged', token => {
    expect(isFileToken(token)).toBe(true)
    expect(parseFilename(buildFilename('foo', token))?.language).toBe(token)
  })

  const rejected = ['a_l_b', 'l_x', 'english_l_x']

  it.each(rejected)('rejects "%s", which the parser would read back as something else', token => {
    expect(isFileToken(token)).toBe(false)
    expect(parseFilename(buildFilename('foo', token))?.language).not.toBe(token)
  })

  it('rejects a token that carries the marker even when it would round trip', () => {
    expect(isFileToken('l_')).toBe(false)
  })

  it('rejects what the grammar itself forbids', () => {
    expect(isFileToken('')).toBe(false)
    expect(isFileToken('English')).toBe(false)
    expect(isFileToken('my lang')).toBe(false)
    expect(isFileToken('lang2')).toBe(false)
    expect(isFileToken('a'.repeat(33))).toBe(false)
  })
})

describe('resolveTargets', () => {
  it('reports the source token of the game', () => {
    expect(resolve([target('ru', 'russian')]).sourceToken).toBe('english')
  })

  it('drops everything when the game ships no file name for the source language', () => {
    const gameDef: GameContextRef = { ...stellarisDef, languageFileToken: { ru: 'russian' } }
    const resolved = resolve([target('ru', 'russian')], gameDef)
    expect(resolved.sourceToken).toBeUndefined()
    expect(resolved.targets).toEqual([])
    expect(resolved.warnings[0]).toContain('source language')
  })

  it('drops a target whose language is the source one', () => {
    const resolved = resolve([target('en', 'english'), target('ru', 'russian')])
    expect(resolved.targets.map(t => t.language)).toEqual(['ru'])
    expect(resolved.warnings[0]).toContain('source language')
  })

  it('drops a target whose file token breaks the filename grammar', () => {
    const resolved = resolve([target('ru', 'a_l_b'), target('fr', 'french')])
    expect(resolved.targets.map(t => t.language)).toEqual(['fr'])
    expect(resolved.warnings[0]).toContain('a_l_b')
  })

  it('keeps the first of two targets for the same language', () => {
    const resolved = resolve([target('tr', 'english'), target('tr', 'turkish')])
    expect(resolved.targets).toEqual([
      { language: 'tr', fileToken: 'english', usesOwnToken: false, shadowsLanguage: 'en' }
    ])
    expect(resolved.warnings[0]).toContain('already a target')
  })

  it('keeps the first of two targets writing the same file token', () => {
    const resolved = resolve([target('tr', 'english'), target('de', 'english')])
    expect(resolved.targets.map(t => t.language)).toEqual(['tr'])
    expect(resolved.warnings[0]).toContain('l_english')
  })

  it('is quiet about a list it accepts whole', () => {
    const resolved = resolve([target('ru', 'russian'), target('fr', 'french')])
    expect(resolved.warnings).toEqual([])
    expect(resolved.targets).toHaveLength(2)
  })

  it('marks a built-in target as owning its token', () => {
    expect(resolve([target('ru', 'russian')]).targets[0]).toEqual({
      language: 'ru',
      fileToken: 'russian',
      usesOwnToken: true
    })
  })

  it('marks the motivating case : Turkish written under the source token', () => {
    expect(resolve([target('tr', 'english')]).targets[0]).toEqual({
      language: 'tr',
      fileToken: 'english',
      usesOwnToken: false,
      shadowsLanguage: 'en'
    })
  })

  it('marks a token owned by another shipped language', () => {
    expect(resolve([target('tr', 'french')]).targets[0]).toEqual({
      language: 'tr',
      fileToken: 'french',
      usesOwnToken: false,
      shadowsLanguage: 'fr'
    })
  })

  it('shadows nothing when the game ships no language for that token', () => {
    expect(resolve([target('tr', 'turkish')]).targets[0]).toEqual({
      language: 'tr',
      fileToken: 'turkish',
      usesOwnToken: false
    })
  })

  it('leaves an empty list empty, with nothing to say about it', () => {
    expect(resolve([])).toEqual({ sourceToken: 'english', targets: [], warnings: [] })
  })
})

describe('resolveTargets - the language is normalized first', () => {
  it('collapses a display name onto the built-in target of that language', () => {
    const resolved = resolve([target('Turkish', 'turkish')], withTurkish)
    expect(resolved.targets).toEqual([{ language: 'tr', fileToken: 'turkish', usesOwnToken: true }])
    expect(resolved.warnings).toEqual([])
  })

  it('recognizes a display name written under a foreign token', () => {
    expect(resolve([target('Turkish', 'english')]).targets[0]).toEqual({
      language: 'tr',
      fileToken: 'english',
      usesOwnToken: false,
      shadowsLanguage: 'en'
    })
  })

  it('keeps a language no built-in code denotes, and still sees what it shadows', () => {
    expect(resolve([target(' Catalan ', 'english')]).targets[0]).toEqual({
      language: 'Catalan',
      fileToken: 'english',
      usesOwnToken: false,
      shadowsLanguage: 'en'
    })
  })

  it('drops a display name that denotes the source language', () => {
    const resolved = resolve([target('English', 'french')])
    expect(resolved.targets).toEqual([])
    expect(resolved.warnings[0]).toContain('source language')
  })

  it('drops a second target of the same language across spellings', () => {
    const resolved = resolve([target('tr', 'english'), target('Turkish', 'french')])
    expect(resolved.targets.map(t => t.fileToken)).toEqual(['english'])
    expect(resolved.warnings[0]).toContain('already a target')
  })

  it('folds a free label the same way findTargetListProblem does', () => {
    const resolved = resolve([target('Catalan', 'english'), target('catalan', 'french')])
    expect(resolved.targets.map(t => t.fileToken)).toEqual(['english'])
    expect(resolved.warnings[0]).toContain('already a target')
  })

  it('drops a language name the grammar forbids', () => {
    const resolved = resolve([target('a,b', 'french'), target('ru', 'russian')])
    expect(resolved.targets.map(t => t.language)).toEqual(['ru'])
    expect(resolved.warnings[0]).toContain('a,b')
  })

  it('keeps a grammatical token no language of the game declares, silently', () => {
    const resolved = resolve([target('Catalan', 'klingon')])
    expect(resolved.targets).toEqual([
      { language: 'Catalan', fileToken: 'klingon', usesOwnToken: false }
    ])
    expect(resolved.warnings).toEqual([])
  })
})

describe('describeInPlaceShadowing', () => {
  const shadowing: ResolvedTarget = {
    language: 'Catalan',
    fileToken: 'english',
    usesOwnToken: false,
    shadowsLanguage: 'en'
  }

  it('says the owner files are replaced when the content mode rewrites them', () => {
    const text = describeInPlaceShadowing(shadowing, 'en', true)
    expect(text).toContain('Catalan')
    expect(text).toContain('l_english')
    expect(text).toContain('replaces the English files')
    expect(text).toContain('reads them back as English')
  })

  it('says only the missing owner files are created otherwise', () => {
    const text = describeInPlaceShadowing(shadowing, 'en', false)
    expect(text).toContain('only creates the English files the mod does not already have')
    expect(text).not.toContain('replaces')
  })

  it('names a built-in target language by its display name', () => {
    expect(describeInPlaceShadowing({ ...shadowing, language: 'tr' }, 'fr', true)).toContain(
      'Turkish written under "l_english" replaces the French files'
    )
  })
})

describe('resolveTargets agrees with the gate the front ends run', () => {
  const tokens = stellarisDef.languageFileToken
  const context = {
    sourceLanguage: 'en',
    mode: 'create-translation-mod',
    targetContent: 'missing-keys'
  } as const

  const accepted: ReadonlyArray<readonly TranslationTarget[]> = [
    [{ language: 'ru', fileToken: 'russian' }],
    [
      { language: 'ru', fileToken: 'russian' },
      { language: 'fr', fileToken: 'french' }
    ],
    [{ language: 'Catalan', fileToken: 'russian' }],
    [{ language: 'Russian', fileToken: 'russian' }]
  ]

  const rejected: ReadonlyArray<readonly TranslationTarget[]> = [
    [],
    [{ language: 'a:b', fileToken: 'russian' }],
    [{ language: 'ru', fileToken: 'l_x' }],
    [{ language: 'ru', fileToken: 'klingon' }],
    [
      { language: 'ru', fileToken: 'russian' },
      { language: 'Russian', fileToken: 'french' }
    ],
    [
      { language: 'ru', fileToken: 'russian' },
      { language: 'fr', fileToken: 'russian' }
    ]
  ]

  it.each(accepted.map(list => [list]))(
    'resolves an accepted list whole, with no warning: %j',
    list => {
      expect(findTargetListIssue(list, tokens, context)).toBeUndefined()
      const resolved = resolveTargets(stellarisDef, 'en', list)
      expect(resolved.warnings).toEqual([])
      expect(resolved.targets).toHaveLength(list.length)
    }
  )

  it.each(rejected.map(list => [list]))(
    'never lets a rejected list through silently: %j',
    list => {
      expect(findTargetListIssue(list, tokens, context)).toBeDefined()
    }
  )

  it('drops the source language itself, which the gate allows through', () => {
    const list: TranslationTarget[] = [{ language: 'en', fileToken: 'english' }]
    expect(findTargetListIssue(list, tokens, context)).toBeUndefined()
    const resolved = resolveTargets(stellarisDef, 'en', list)
    expect(resolved.targets).toEqual([])
    expect(resolved.warnings[0]).toContain('is the source language')
  })
})
