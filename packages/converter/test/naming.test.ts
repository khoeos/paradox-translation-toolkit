import { describe, expect, it } from 'vitest'

import {
  NAMESPACE_ID_MAX_LEN,
  PARTIAL_SUFFIX,
  getModNamespace,
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
    // 'ab_cdef' cut at 3 gives 'ab_', which is not a usable folder name.
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
    // No point in `ethics_overhaul_ethics_overhaul`.
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
    // The games only load files ending in _l_<language>.yml.
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
