import { describe, expect, it } from 'vitest'

import {
  NAMESPACE_ID_MAX_LEN,
  PARTIAL_SUFFIX,
  getModNamespace,
  rewriteLanguageInPath,
  sanitizeFolderName,
  withPartialSuffix
} from '../src/index.js'

describe('sanitizeFolderName', () => {
  it('collapses every run of non-alphanumerics into one underscore', () => {
    expect(sanitizeFolderName('Missing Translations!! (v2)', 48)).toBe('missing_translations_v2')
  })

  it('lowercases the result', () => {
    expect(sanitizeFolderName('MyMod', 48)).toBe('mymod')
  })

  it('trims leading and trailing separators', () => {
    expect(sanitizeFolderName('  -- mod --  ', 48)).toBe('mod')
  })

  it('returns an empty string when nothing usable is left', () => {
    expect(sanitizeFolderName('!!! ???', 48)).toBe('')
    expect(sanitizeFolderName('', 48)).toBe('')
  })

  it('truncates to the requested length', () => {
    expect(sanitizeFolderName('abcdefghij', 4)).toBe('abcd')
  })

  it('trims again when the truncation lands on a separator', () => {
    expect(sanitizeFolderName('ab cdef', 3)).toBe('ab')
  })

  it('keeps digits, which is what workshop ids are made of', () => {
    expect(sanitizeFolderName('2887679980', 32)).toBe('2887679980')
  })
})

describe('getModNamespace', () => {
  it('joins the folder id and the declared name', () => {
    expect(getModNamespace('2887679980', 'Ethics Overhaul')).toBe('2887679980_ethics_overhaul')
  })

  it('drops the name when the folder is already named after the mod', () => {
    expect(getModNamespace('Ethics Overhaul', 'Ethics Overhaul')).toBe('ethics_overhaul')
  })

  it('drops the name when the folder merely contains it', () => {
    expect(getModNamespace('my_ethics_mod', 'ethics')).toBe('my_ethics_mod')
  })

  it('falls back to the name when the folder sanitizes to nothing', () => {
    expect(getModNamespace('???', 'Ethics Overhaul')).toBe('ethics_overhaul')
  })

  it('falls back to a literal when neither is usable', () => {
    expect(getModNamespace('???', '!!!')).toBe('mod')
  })

  it('keeps the id when the name is unusable', () => {
    expect(getModNamespace('2887679980', '???')).toBe('2887679980')
  })

  it('caps each half independently', () => {
    const id = 'a'.repeat(40)
    const namespace = getModNamespace(id, 'b'.repeat(40))
    const [left, right] = namespace.split('_')
    expect(left).toHaveLength(NAMESPACE_ID_MAX_LEN)
    expect(right).toHaveLength(NAMESPACE_ID_MAX_LEN)
  })

  it('is stable, since it is the pivot tying generated files back to their mod', () => {
    expect(getModNamespace('2887679980', 'Ethics Overhaul')).toBe(
      getModNamespace('2887679980', 'Ethics Overhaul')
    )
  })
})

describe('withPartialSuffix', () => {
  it('inserts the marker before the language tail, never after it', () => {
    expect(withPartialSuffix('mod/localisation/russian/foo_l_russian.yml')).toBe(
      `mod/localisation/russian/foo${PARTIAL_SUFFIX}_l_russian.yml`
    )
  })

  it('keeps the directory untouched', () => {
    const out = withPartialSuffix('a/b/c/name_l_french.yml')
    expect(out.startsWith('a/b/c/')).toBe(true)
  })

  it('handles a bare filename with no directory', () => {
    expect(withPartialSuffix('name_l_french.yml')).toBe(`name${PARTIAL_SUFFIX}_l_french.yml`)
  })

  it('falls back to the extension when there is no language tail', () => {
    expect(withPartialSuffix('dir/readme.txt')).toBe(`dir/readme${PARTIAL_SUFFIX}.txt`)
  })

  it('appends to a name with no extension at all', () => {
    expect(withPartialSuffix('dir/README')).toBe(`dir/README${PARTIAL_SUFFIX}`)
  })

  it('leaves a dotfile alone rather than treating it as an extension', () => {
    expect(withPartialSuffix('.gitignore')).toBe(`.gitignore${PARTIAL_SUFFIX}`)
  })

  it('normalises backslashes like every other path helper', () => {
    expect(withPartialSuffix('mod\\loc\\foo_l_russian.yml')).toBe(
      `mod/loc/foo${PARTIAL_SUFFIX}_l_russian.yml`
    )
  })
})

describe('rewriteLanguageInPath', () => {
  it('renames a folder that is the language', () => {
    expect(
      rewriteLanguageInPath('localisation/english/a_l_english.yml', 'english', 'russian')
    ).toBe('localisation/russian/a_l_russian.yml')
  })

  it('never renames a folder that merely contains the language', () => {
    expect(
      rewriteLanguageInPath('english_names_fix/localisation/a_l_english.yml', 'english', 'russian')
    ).toBe('english_names_fix/localisation/a_l_russian.yml')
  })

  it('rewrites the language tail of the file name', () => {
    expect(rewriteLanguageInPath('loc/foo_l_english.yml', 'english', 'braz_por')).toBe(
      'loc/foo_l_braz_por.yml'
    )
  })

  it('leaves a file whose tail is another language alone', () => {
    expect(rewriteLanguageInPath('loc/foo_l_french.yml', 'english', 'russian')).toBe(
      'loc/foo_l_french.yml'
    )
  })

  it('matches the folder case-insensitively', () => {
    expect(rewriteLanguageInPath('loc/English/a_l_english.yml', 'english', 'russian')).toBe(
      'loc/russian/a_l_russian.yml'
    )
  })

  it('leaves a path with nothing to rewrite untouched', () => {
    expect(rewriteLanguageInPath('loc/readme.txt', 'english', 'russian')).toBe('loc/readme.txt')
  })
})
