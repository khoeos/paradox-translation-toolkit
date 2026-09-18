import { describe, expect, it } from 'vitest'

import { TranslationTargetSchema } from '../src/index.js'
import {
  builtInTargetFor,
  describeTargetListProblem,
  findTargetListIssue,
  findTargetListProblem,
  gameTokenOwner,
  getLanguageDisplayName,
  getTargetLanguageCode,
  isFileToken,
  isGameToken,
  isLanguageCode,
  isLanguageLabel,
  normalizeFileToken,
  normalizeTargetLanguage,
  normalizeTargets,
  shadowedLanguageOf,
  targetsFromLanguages,
  uniqueTargetLanguages,
  usesOwnToken,
  type GameTokens,
  type TranslationTarget
} from '../src/languages.js'

describe('isLanguageCode', () => {
  it('accepts a known code', () => {
    expect(isLanguageCode('tr')).toBe(true)
  })

  it('rejects an unknown code', () => {
    expect(isLanguageCode('xx')).toBe(false)
  })
})

describe('normalizeFileToken', () => {
  it('trims and lowercases', () => {
    expect(normalizeFileToken('  English  ')).toBe('english')
  })
})

describe('isFileToken', () => {
  it.each([
    ['english', true],
    ['my_lang', true],
    ['a b', false],
    ['English', false],
    ['lang1', false],
    ['my-lang', false],
    ['', false],
    ['a'.repeat(33), false],
    ['a_l_b', false],
    ['l_x', false],
    ['l_', false],
    ['_english', true],
    ['english_', true]
  ])('isFileToken(%j) === %j', (input, expected) => {
    expect(isFileToken(input)).toBe(expected)
  })
})

describe('getTargetLanguageCode', () => {
  it.each([
    ['tr', 'tr'],
    ['TR', 'tr'],
    ['  tr  ', 'tr'],
    ['Turkish', 'tr'],
    ['turkish', 'tr'],
    ['SIMP_CHINESE', 'zh-Hans'],
    ['braz_por', 'pt-BR'],
    ['Catalan', undefined],
    ['', undefined],
    ['constructor', undefined],
    ['__proto__', undefined],
    ['hasOwnProperty', undefined],
    ['toString', undefined]
  ])('getTargetLanguageCode(%j) === %j', (input, expected) => {
    expect(getTargetLanguageCode(input)).toBe(expected)
  })

  it.each(['constructor', '__proto__', 'hasOwnProperty'])(
    'keeps %j a plain string through normalizeTargetLanguage, so isLanguageLabel holds',
    name => {
      const normalized = normalizeTargetLanguage(name)
      expect(typeof normalized).toBe('string')
      expect(normalized).toBe(name)
      expect(isLanguageLabel(normalized)).toBe(true)
    }
  )
})

describe('normalizeTargetLanguage / normalizeTargets', () => {
  it.each([
    ['tr', 'tr'],
    ['TR', 'tr'],
    ['  tr  ', 'tr'],
    ['Turkish', 'tr'],
    ['turkish', 'tr'],
    ['SIMP_CHINESE', 'zh-Hans'],
    ['braz_por', 'pt-BR'],
    ['Catalan', 'Catalan'],
    ['Catalan ', 'Catalan']
  ])('normalizeTargetLanguage(%j) === %j', (input, expected) => {
    expect(normalizeTargetLanguage(input)).toBe(expected)
  })

  it.each([
    'tr',
    'TR',
    '  tr  ',
    'Turkish',
    'turkish',
    'SIMP_CHINESE',
    'braz_por',
    'Catalan',
    'Catalan '
  ])('is idempotent for %j', input => {
    const once = normalizeTargetLanguage(input)
    expect(normalizeTargetLanguage(once)).toBe(once)
  })

  it('normalizes every target in a list', () => {
    const targets: TranslationTarget[] = [
      { language: 'Turkish', fileToken: 'turkish' },
      { language: 'Catalan ', fileToken: 'english' }
    ]
    expect(normalizeTargets(targets)).toEqual([
      { language: 'tr', fileToken: 'turkish' },
      { language: 'Catalan', fileToken: 'english' }
    ])
  })
})

describe('getLanguageDisplayName', () => {
  it.each([
    ['tr', 'Turkish'],
    ['Turkish', 'Turkish'],
    ['Catalan', 'Catalan'],
    ['braz_por', 'Brazilian Portuguese']
  ])('getLanguageDisplayName(%j) === %j', (input, expected) => {
    expect(getLanguageDisplayName(input)).toBe(expected)
  })
})

describe('isLanguageLabel', () => {
  it.each([
    ['', false],
    ['a'.repeat(64), true],
    ['a'.repeat(65), false],
    ['a:b', false],
    ['a,b', false],
    ['a b', true],
    [' a', false],
    ['a ', false]
  ])('isLanguageLabel(%j) === %j', (input, expected) => {
    expect(isLanguageLabel(input)).toBe(expected)
  })
})

describe('gameTokenOwner / usesOwnToken / shadowedLanguageOf', () => {
  const tokens: GameTokens = { en: 'english', fr: 'french' }

  it('finds the owner of a token', () => {
    expect(gameTokenOwner('french', tokens)).toBe('fr')
  })

  it('returns undefined for an unowned token', () => {
    expect(gameTokenOwner('turkish', tokens)).toBeUndefined()
  })

  it('usesOwnToken is true when the target matches the game token for its language', () => {
    const target: TranslationTarget = { language: 'en', fileToken: 'english' }
    expect(usesOwnToken(target, tokens)).toBe(true)
  })

  it('usesOwnToken is true for a normalized code matching the game token', () => {
    const target: TranslationTarget = { language: 'tr', fileToken: 'turkish' }
    const withTurkish: GameTokens = { ...tokens, tr: 'turkish' }
    expect(usesOwnToken(target, withTurkish)).toBe(true)
  })

  it('usesOwnToken is false for an unnormalized label, even one that would resolve to the owner', () => {
    const target: TranslationTarget = { language: 'Turkish', fileToken: 'turkish' }
    const withTurkish: GameTokens = { ...tokens, tr: 'turkish' }
    expect(usesOwnToken(target, withTurkish)).toBe(false)
  })

  it('usesOwnToken is false for a target writing under another token', () => {
    const target: TranslationTarget = { language: 'tr', fileToken: 'english' }
    expect(usesOwnToken(target, tokens)).toBe(false)
  })

  it('shadowedLanguageOf is defined when the token belongs to another shipped language (built-in code)', () => {
    const target: TranslationTarget = { language: 'tr', fileToken: 'english' }
    expect(shadowedLanguageOf(target, tokens)).toBe('en')
  })

  it('shadowedLanguageOf is defined for a free-text label under a shipped token', () => {
    const target: TranslationTarget = { language: 'Catalan', fileToken: 'english' }
    expect(shadowedLanguageOf(target, tokens)).toBe('en')
  })

  it('shadowedLanguageOf is undefined for the token owner itself', () => {
    const target: TranslationTarget = { language: 'en', fileToken: 'english' }
    expect(shadowedLanguageOf(target, tokens)).toBeUndefined()
  })

  it('shadowedLanguageOf is undefined for a token the game does not ship', () => {
    const target: TranslationTarget = { language: 'Catalan', fileToken: 'klingon' }
    expect(shadowedLanguageOf(target, tokens)).toBeUndefined()
  })
})

describe('isGameToken', () => {
  const tokens: GameTokens = { en: 'english', fr: 'french' }

  it('accepts a declared token', () => {
    expect(isGameToken('english', tokens)).toBe(true)
  })

  it('rejects an undeclared token', () => {
    expect(isGameToken('turkish', tokens)).toBe(false)
  })
})

describe('builtInTargetFor', () => {
  const tokens: GameTokens = { en: 'english' }

  it('returns the built-in target when the game ships the language', () => {
    expect(builtInTargetFor('en', tokens)).toEqual({ language: 'en', fileToken: 'english' })
  })

  it('returns undefined when the game does not ship the language', () => {
    expect(builtInTargetFor('tr', tokens)).toBeUndefined()
  })
})

describe('uniqueTargetLanguages', () => {
  it('collapses targets that share a language', () => {
    const targets: TranslationTarget[] = [
      { language: 'en', fileToken: 'english' },
      { language: 'tr', fileToken: 'turkish' },
      { language: 'en', fileToken: 'braz_por' }
    ]
    expect(uniqueTargetLanguages(targets)).toEqual(['en', 'tr'])
  })

  it('returns an empty list for no targets', () => {
    expect(uniqueTargetLanguages([])).toEqual([])
  })
})

describe('targetsFromLanguages', () => {
  const tokens: GameTokens = { en: 'english', tr: 'turkish' }

  it('builds the built-in target for every shipped language', () => {
    expect(targetsFromLanguages(['en', 'tr'], tokens)).toEqual([
      { language: 'en', fileToken: 'english' },
      { language: 'tr', fileToken: 'turkish' }
    ])
  })

  it('drops a language the game does not ship', () => {
    expect(targetsFromLanguages(['en', 'fr'], tokens)).toEqual([
      { language: 'en', fileToken: 'english' }
    ])
  })

  it('drops a value that is not a language code', () => {
    expect(targetsFromLanguages(['English', ''], tokens)).toEqual([])
  })
})

describe('findTargetListProblem', () => {
  const tokens: GameTokens = { en: 'english', tr: 'turkish' }

  it('flags an empty list', () => {
    expect(findTargetListProblem([], tokens)).toEqual({ code: 'empty' })
  })

  it('flags an invalid language', () => {
    const targets: TranslationTarget[] = [{ language: 'a:b', fileToken: 'english' }]
    expect(findTargetListProblem(targets, tokens)).toEqual({ code: 'invalid-language', index: 0 })
  })

  it('flags an invalid token', () => {
    const targets: TranslationTarget[] = [{ language: 'en', fileToken: 'l_x' }]
    expect(findTargetListProblem(targets, tokens)).toEqual({ code: 'invalid-token', index: 0 })
  })

  it('flags an unknown (undeclared) token', () => {
    const targets: TranslationTarget[] = [{ language: 'en', fileToken: 'klingon' }]
    expect(findTargetListProblem(targets, tokens)).toEqual({
      code: 'unknown-token',
      index: 0,
      fileToken: 'klingon'
    })
  })

  it('flags a duplicate language across a code and its display name', () => {
    const targets: TranslationTarget[] = [
      { language: 'tr', fileToken: 'turkish' },
      { language: 'Turkish', fileToken: 'english' }
    ]
    expect(findTargetListProblem(targets, tokens)).toEqual({
      code: 'duplicate-language',
      index: 1,
      language: 'Turkish'
    })
  })

  it('flags a duplicate language across two free-text spellings', () => {
    const targets: TranslationTarget[] = [
      { language: 'Catalan', fileToken: 'english' },
      { language: 'catalan', fileToken: 'turkish' }
    ]
    expect(findTargetListProblem(targets, tokens)).toEqual({
      code: 'duplicate-language',
      index: 1,
      language: 'catalan'
    })
  })

  it('flags a duplicate token', () => {
    const targets: TranslationTarget[] = [
      { language: 'en', fileToken: 'english' },
      { language: 'tr', fileToken: 'english' }
    ]
    expect(findTargetListProblem(targets, tokens)).toEqual({
      code: 'duplicate-token',
      index: 1,
      fileToken: 'english'
    })
  })

  it('passes a valid list', () => {
    const targets: TranslationTarget[] = [
      { language: 'en', fileToken: 'english' },
      { language: 'tr', fileToken: 'turkish' }
    ]
    expect(findTargetListProblem(targets, tokens)).toBeUndefined()
  })
})

describe('TranslationTargetSchema', () => {
  it('accepts a valid built-in target', () => {
    const result = TranslationTargetSchema.safeParse({ language: 'tr', fileToken: 'english' })
    expect(result.success).toBe(true)
  })

  it('accepts a free-text language label', () => {
    const result = TranslationTargetSchema.safeParse({ language: 'Catalan', fileToken: 'english' })
    expect(result.success).toBe(true)
  })

  it('accepts a mistyped code as a free-text language (R2: normalization, not a closed enum)', () => {
    const result = TranslationTargetSchema.safeParse({ language: 'xx', fileToken: 'english' })
    expect(result.success).toBe(true)
  })

  it('rejects an empty language', () => {
    const result = TranslationTargetSchema.safeParse({ language: '', fileToken: 'english' })
    expect(result.success).toBe(false)
  })

  it('rejects a whitespace-only language', () => {
    const result = TranslationTargetSchema.safeParse({ language: '  ', fileToken: 'english' })
    expect(result.success).toBe(false)
  })

  it('rejects a language containing the --to separator ":"', () => {
    const result = TranslationTargetSchema.safeParse({ language: 'a:b', fileToken: 'english' })
    expect(result.success).toBe(false)
  })

  it('rejects a language longer than 64 characters', () => {
    const result = TranslationTargetSchema.safeParse({
      language: 'a'.repeat(65),
      fileToken: 'english'
    })
    expect(result.success).toBe(false)
  })

  it('rejects a token carrying the l_ marker', () => {
    const result = TranslationTargetSchema.safeParse({ language: 'tr', fileToken: 'l_x' })
    expect(result.success).toBe(false)
  })

  it('rejects an empty token', () => {
    const result = TranslationTargetSchema.safeParse({ language: 'tr', fileToken: '' })
    expect(result.success).toBe(false)
  })
})

describe('findTargetListIssue', () => {
  const tokens: GameTokens = { en: 'english', tr: 'turkish', ru: 'russian' }
  const base = {
    sourceLanguage: 'en',
    mode: 'create-translation-mod',
    targetContent: 'missing-keys'
  } as const

  const turkish: TranslationTarget[] = [{ language: 'tr', fileToken: 'turkish' }]
  const freeText: TranslationTarget[] = [{ language: 'Catalan', fileToken: 'english' }]

  it('accepts a list nothing is wrong with', () => {
    expect(findTargetListIssue(turkish, tokens, base)).toBeUndefined()
  })

  it('returns the shape problem first, before any provider or mode check', () => {
    const broken: TranslationTarget[] = [{ language: 'tr', fileToken: 'klingon' }]
    expect(findTargetListIssue(broken, tokens, { ...base, provider: 'rapidapi' })).toEqual({
      code: 'unknown-token',
      index: 0,
      fileToken: 'klingon'
    })
  })

  it('flags a free-text language RapidAPI cannot reach', () => {
    expect(findTargetListIssue(freeText, tokens, { ...base, provider: 'rapidapi' })).toEqual({
      code: 'rapidapi-unsupported',
      index: 0,
      language: 'Catalan'
    })
  })

  it('leaves the same list alone for another provider, and when translation is off', () => {
    expect(findTargetListIssue(freeText, tokens, { ...base, provider: 'openai' })).toBeUndefined()
    expect(findTargetListIssue(freeText, tokens, base)).toBeUndefined()
  })

  it('flags a target that would write into the source file with nothing to add', () => {
    const intoSource: TranslationTarget[] = [{ language: 'tr', fileToken: 'english' }]
    const context = { ...base, mode: 'add-to-current', targetContent: 'missing-keys' } as const
    expect(findTargetListIssue(intoSource, tokens, context)).toEqual({
      code: 'nothing-to-write',
      index: 0,
      fileToken: 'english'
    })
  })

  it('allows that same target once the whole file is rewritten', () => {
    const intoSource: TranslationTarget[] = [{ language: 'tr', fileToken: 'english' }]
    const context = { ...base, mode: 'add-to-current', targetContent: 'complete-file' } as const
    expect(findTargetListIssue(intoSource, tokens, context)).toBeUndefined()
  })
})

describe('describeTargetListProblem', () => {
  const game = {
    displayName: 'Stellaris',
    languageFileToken: { en: 'english', tr: 'turkish' } as GameTokens
  }
  const targets: TranslationTarget[] = [{ language: 'Catalan', fileToken: 'english' }]

  const problems = [
    { code: 'empty' },
    { code: 'invalid-language', index: 0 },
    { code: 'invalid-token', index: 0 },
    { code: 'unknown-token', index: 0, fileToken: 'klingon' },
    { code: 'duplicate-language', index: 0, language: 'tr' },
    { code: 'duplicate-token', index: 0, fileToken: 'turkish' },
    { code: 'rapidapi-unsupported', index: 0, language: 'Catalan' },
    { code: 'nothing-to-write', index: 0, fileToken: 'english' }
  ] as const

  it.each(problems)('describes $code', problem => {
    expect(describeTargetListProblem(problem, targets, game)).toBeTruthy()
  })
})
