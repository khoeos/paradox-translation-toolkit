import { describe, expect, it } from 'vitest'

import { buildFilename, parseFilename } from '../src/filename.js'

describe('parseFilename', () => {
  it('parses a simple english filename', () => {
    expect(parseFilename('mymod_l_english.yml')).toEqual({
      base: 'mymod',
      language: 'english'
    })
  })

  it('parses a filename with multi-word base', () => {
    expect(parseFilename('events_part_one_l_french.yml')).toEqual({
      base: 'events_part_one',
      language: 'french'
    })
  })

  it('parses Stellaris simp_chinese token', () => {
    expect(parseFilename('mymod_l_simp_chinese.yml')).toEqual({
      base: 'mymod',
      language: 'simp_chinese'
    })
  })

  it('parses Stellaris braz_por token', () => {
    expect(parseFilename('mymod_l_braz_por.yml')).toEqual({
      base: 'mymod',
      language: 'braz_por'
    })
  })

  it('lowercases language token', () => {
    expect(parseFilename('mymod_l_ENGLISH.yml')).toEqual({
      base: 'mymod',
      language: 'english'
    })
  })

  it('returns null for files without _l_ suffix', () => {
    expect(parseFilename('mymod.yml')).toBeNull()
  })

  it('returns null for non-yml files', () => {
    expect(parseFilename('mymod_l_english.txt')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseFilename('')).toBeNull()
  })

  it('does not corrupt base names containing language-like substrings', () => {
    // The current v2 bug: replaceAll('english', 'french') on 'englishtutor_mod' would corrupt.
    // Our parser extracts the explicit `_l_<lang>` suffix instead.
    expect(parseFilename('englishtutor_mod_l_english.yml')).toEqual({
      base: 'englishtutor_mod',
      language: 'english'
    })
  })
})

describe('buildFilename', () => {
  it('builds a canonical filename', () => {
    expect(buildFilename('mymod', 'french')).toBe('mymod_l_french.yml')
  })

  it('handles multi-word language tokens', () => {
    expect(buildFilename('mymod', 'simp_chinese')).toBe('mymod_l_simp_chinese.yml')
  })

  it('round-trips with parseFilename', () => {
    const cases: Array<[string, string]> = [
      ['events', 'english'],
      ['my_complex_mod', 'simp_chinese'],
      ['a', 'braz_por']
    ]
    for (const [base, lang] of cases) {
      const filename = buildFilename(base, lang)
      expect(parseFilename(filename)).toEqual({ base, language: lang })
    }
  })
})
