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

  it('splits at the last marker when the base itself contains one', () => {
    expect(parseFilename('mod_l_english_l_french.yml')).toEqual({
      base: 'mod_l_english',
      language: 'french'
    })
  })

  it('falls back to an earlier marker when the last one has no language', () => {
    expect(parseFilename('mod_l_eng_l_.yml')).toEqual({ base: 'mod', language: 'eng_l_' })
  })

  it('accepts an upper-case marker and extension', () => {
    expect(parseFilename('MOD_L_ENGLISH.YML')).toEqual({ base: 'MOD', language: 'english' })
  })

  it('rejects a language holding a non-letter', () => {
    expect(parseFilename('mod_l_eng-lish.yml')).toBeNull()
    expect(parseFilename('mod_l_english2.yml')).toBeNull()
  })

  it('rejects an empty base or an empty language', () => {
    expect(parseFilename('_l_english.yml')).toBeNull()
    expect(parseFilename('mod_l_.yml')).toBeNull()
  })

  it('stays linear on a name repeating the marker', () => {
    const name = `${'_l_a'.repeat(50_000)}.`
    const start = Date.now()
    expect(parseFilename(name)).toBeNull()
    expect(Date.now() - start).toBeLessThan(500)
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
