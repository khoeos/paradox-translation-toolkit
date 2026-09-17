import { describe, expect, it } from 'vitest'

import { scanMods } from '@ptt/converter'
import { MemoryFs } from '@ptt/converter/test/memory-fs'
import { stellaris } from '@ptt/games'

import type { ReportMod, RunErrorCategory } from './run-errors.js'

import {
  filterReportMods,
  getErrorCategorySummaries,
  getReadErrorsByLanguageFolder,
  isFilterCompatibleWithCategory,
  parseModError,
  parseModErrors,
  sortReportMods
} from './run-errors.js'

const UNTERMINATED =
  'H:/SteamLibrary/steamapps/workshop/content/1158310/2216850785/localization/french/more_game_rules_l_french.yml:546 : Value string never closed before the next key `setting_mgr_aw_king_shattered_realms` (line 547), line skipped'

const NO_HEADER =
  'H:/SteamLibrary/steamapps/workshop/content/1158310/2291024373/localization/english/event_localization/lotr_events/lotr_event_filler_l_english.yml:213 : No `l_<language>:` header in the file, so none of its keys can be read'

const BLOCKED =
  'H:/SteamLibrary/steamapps/workshop/content/1158310/2291024373/localization/german/lotr_decisions_ptt_missing_l_german.yml : Parse failed for H:/SteamLibrary/steamapps/workshop/content/1158310/2291024373/localization/english/lotr_decisions_l_english.yml: 4597:53 [unterminated-string] Value string never closed before the next key `decision_khorahil_infiltrate_yellow_mountains.tt5` (line 4598), line skipped'

const BLOCKED_2 =
  'H:/SteamLibrary/steamapps/workshop/content/1158310/2507209632/localization/german/EPE_headgears_l_german.yml : Parse failed for H:/SteamLibrary/steamapps/workshop/content/1158310/2507209632/localization/english/EPE_headgears_l_english.yml: 1135:85 [unterminated-string] Value string never closed before the next key `PORTRAIT_MODIFIER_custom_headgear_f_headgear_sec_epe_fp4_western_era3_commoner_04` (line 1136), line skipped'

describe('parseModError', () => {
  it('categorises an unclosed value string as unterminated', () => {
    const parsed = parseModError(UNTERMINATED)
    expect(parsed.category).toBe('unterminated')
    expect(parsed.languageFolder).toBe('french')
    expect(parsed.file).toBe('french/more_game_rules_l_french.yml')
    expect(parsed.message).toContain('never closed')
  })

  it('categorises a missing language header', () => {
    const parsed = parseModError(NO_HEADER)
    expect(parsed.category).toBe('header')
    expect(parsed.languageFolder).toBe('english')
    expect(parsed.file).toBe('lotr_events/lotr_event_filler_l_english.yml')
  })

  it('categorises a blocked write and extracts source file and detail', () => {
    const parsed = parseModError(BLOCKED)
    expect(parsed.category).toBe('blocked')
    expect(parsed.languageFolder).toBe('german')
    expect(parsed.file).toBe('german/lotr_decisions_ptt_missing_l_german.yml')
    expect(parsed.sourceFile).toBe(
      'H:/SteamLibrary/steamapps/workshop/content/1158310/2291024373/localization/english/lotr_decisions_l_english.yml'
    )
    expect(parsed.detail).toBe(
      'Value string never closed before the next key `decision_khorahil_infiltrate_yellow_mountains.tt5` (line 4598), line skipped'
    )
  })

  it('categorises the second blocked write sample', () => {
    const parsed = parseModError(BLOCKED_2)
    expect(parsed.category).toBe('blocked')
    expect(parsed.sourceFile).toBe(
      'H:/SteamLibrary/steamapps/workshop/content/1158310/2507209632/localization/english/EPE_headgears_l_english.yml'
    )
  })

  it('accepts British spelling "localisation"', () => {
    const raw =
      'H:/mods/1234/localisation/english/foo_l_english.yml:12 : No `l_<language>:` header in the file, so none of its keys can be read'
    const parsed = parseModError(raw)
    expect(parsed.category).toBe('header')
    expect(parsed.languageFolder).toBe('english')
  })

  it('falls back to "other" and an empty location when there is no " : " separator', () => {
    const parsed = parseModError('just a bare message with no separator at all')
    expect(parsed.category).toBe('other')
    expect(parsed.location).toBe('')
    expect(parsed.message).toBe('just a bare message with no separator at all')
    expect(parsed.languageFolder).toBeUndefined()
  })

  it('leaves languageFolder undefined when the location has no localization folder', () => {
    const parsed = parseModError('C:/some/other/path/file_l_english.yml:5 : Some other message')
    expect(parsed.languageFolder).toBeUndefined()
    expect(parsed.category).toBe('other')
  })

  it('skips the "replace" override subdir and reports the real language', () => {
    const parsed = parseModError(
      'H:/mods/1234/localization/replace/english/foo_l_english.yml:12 : Some other message'
    )
    expect(parsed.languageFolder).toBe('english')
  })

  it('matches the localization folder case-insensitively', () => {
    const parsed = parseModError(
      'H:/mods/1234/Localization/English/foo_l_english.yml:12 : Some other message'
    )
    expect(parsed.languageFolder).toBe('english')
  })

  it('matches an uppercase "Replace" override subdir too', () => {
    const parsed = parseModError(
      'H:/mods/1234/Localisation/Replace/French/foo_l_french.yml:12 : Some other message'
    )
    expect(parsed.languageFolder).toBe('french')
  })

  it('accepts backslash separators', () => {
    const parsed = parseModError(
      'H:\\mods\\1234\\localization\\replace\\german\\foo_l_german.yml:12 : Some other message'
    )
    expect(parsed.languageFolder).toBe('german')
  })

  it('accepts mixed separators', () => {
    const parsed = parseModError(
      'H:\\mods\\1234/localization\\english/foo_l_english.yml:12 : Some other message'
    )
    expect(parsed.languageFolder).toBe('english')
  })

  it('leaves languageFolder undefined for a file sitting directly in the loc folder', () => {
    const parsed = parseModError(
      'H:/mods/1234/localization/foo_l_english.yml:12 : Some other message'
    )
    expect(parsed.languageFolder).toBeUndefined()
  })

  it('leaves languageFolder undefined for a file sitting directly in the override subdir', () => {
    const parsed = parseModError(
      'H:/mods/1234/localization/replace/foo_l_english.yml:12 : Some other message'
    )
    expect(parsed.languageFolder).toBeUndefined()
  })

  it('does not mistake a folder merely containing "localization" for the loc folder', () => {
    const parsed = parseModError(
      'H:/mods/1234/localization/english/event_localization/lotr/foo_l_english.yml:12 : Some other message'
    )
    expect(parsed.languageFolder).toBe('english')
  })
})

describe('parseModErrors', () => {
  it('maps every raw error string', () => {
    const parsed = parseModErrors([UNTERMINATED, NO_HEADER])
    expect(parsed).toHaveLength(2)
    expect(parsed[0]?.category).toBe('unterminated')
    expect(parsed[1]?.category).toBe('header')
  })
})

const mod = (overrides: Partial<ReportMod>): ReportMod => ({
  id: '1',
  name: 'Mod',
  created: 0,
  failed: 0,
  errors: [],
  ...overrides
})

describe('getErrorCategorySummaries', () => {
  it('counts errors per category in the fixed order blocked, header, unterminated, other', () => {
    const summaries = getErrorCategorySummaries([
      mod({ errors: [BLOCKED, NO_HEADER, UNTERMINATED] })
    ])
    expect(summaries.map(s => s.category)).toEqual(['blocked', 'header', 'unterminated', 'other'])
    expect(summaries.find(s => s.category === 'blocked')?.count).toBe(1)
    expect(summaries.find(s => s.category === 'header')?.count).toBe(1)
    expect(summaries.find(s => s.category === 'unterminated')?.count).toBe(1)
    expect(summaries.find(s => s.category === 'other')?.count).toBe(0)
  })

  it('caps languages at the top 5', () => {
    const languages = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const errors = languages.map(
      (lang, index) =>
        `H:/mods/1/localization/${lang}/f.yml:1 : ${'x'.repeat(index + 1)} never closed before next key`
    )
    const summaries = getErrorCategorySummaries([mod({ errors })])
    const unterminated = summaries.find(s => s.category === 'unterminated')
    expect(unterminated?.count).toBe(7)
    expect(unterminated?.languages).toHaveLength(5)
  })
})

describe('getReadErrorsByLanguageFolder', () => {
  it('groups by language folder with counts and percentages', () => {
    const result = getReadErrorsByLanguageFolder([
      mod({ errors: [UNTERMINATED, NO_HEADER] }),
      mod({ errors: [BLOCKED] })
    ])
    const french = result.find(r => r.name === 'french')
    const english = result.find(r => r.name === 'english')
    const german = result.find(r => r.name === 'german')
    expect(french?.count).toBe(1)
    expect(english?.count).toBe(1)
    expect(german?.count).toBe(1)
    expect(french?.pct).toBeCloseTo(100 / 3)
  })

  it('does not invent a "replace" language when mods use the override subdir', () => {
    const result = getReadErrorsByLanguageFolder([
      mod({
        errors: [
          'H:/mods/1/localization/replace/english/a_l_english.yml:1 : Some other message',
          'H:/mods/1/localization/english/b_l_english.yml:1 : Some other message'
        ]
      })
    ])
    expect(result).toEqual([{ name: 'english', count: 2, pct: 100 }])
  })

  it('groups errors without a recognisable language folder under an empty name', () => {
    const result = getReadErrorsByLanguageFolder([
      mod({ errors: ['C:/other/file.yml:1 : Some other message'] })
    ])
    expect(result).toEqual([{ name: '', count: 1, pct: 100 }])
  })
})

describe('filterReportMods', () => {
  const clean = mod({ id: 'clean', name: 'Clean Mod', errors: [] })
  const withMessages = mod({ id: 'msgs', name: 'Messages Mod', errors: [UNTERMINATED] })
  const withFailures = mod({ id: 'fail', name: 'Failing Mod', failed: 3, errors: [BLOCKED] })

  it('"all" returns everything', () => {
    expect(filterReportMods([clean, withMessages, withFailures], 'all', null, '')).toHaveLength(3)
  })

  it('"issues" returns mods with messages or failures', () => {
    const result = filterReportMods([clean, withMessages, withFailures], 'issues', null, '')
    expect(result.map(m => m.id).toSorted()).toEqual(['fail', 'msgs'])
  })

  it('"failed" returns only mods with failed > 0', () => {
    const result = filterReportMods([clean, withMessages, withFailures], 'failed', null, '')
    expect(result.map(m => m.id)).toEqual(['fail'])
  })

  it('"clean" returns only mods with no errors and no failures', () => {
    const result = filterReportMods([clean, withMessages, withFailures], 'clean', null, '')
    expect(result.map(m => m.id)).toEqual(['clean'])
  })

  it('filters by error category', () => {
    const result = filterReportMods([clean, withMessages, withFailures], 'all', 'unterminated', '')
    expect(result.map(m => m.id)).toEqual(['msgs'])
  })

  it('filters by search text across name, id and error file', () => {
    expect(filterReportMods([withMessages, withFailures], 'all', null, 'messages mod')).toEqual([
      withMessages
    ])
    expect(filterReportMods([withMessages, withFailures], 'all', null, 'fail')).toEqual([
      withFailures
    ])
  })

  it('combines filter, category and search', () => {
    const result = filterReportMods(
      [clean, withMessages, withFailures],
      'issues',
      'blocked',
      'failing'
    )
    expect(result.map(m => m.id)).toEqual(['fail'])
  })
})

describe('isFilterCompatibleWithCategory', () => {
  it('accepts every filter while no category is active', () => {
    for (const filter of ['all', 'issues', 'failed', 'clean'] as const) {
      expect(isFilterCompatibleWithCategory(filter, null)).toBe(true)
    }
  })

  it('rejects "clean" while a category is active', () => {
    expect(isFilterCompatibleWithCategory('clean', 'blocked')).toBe(false)
  })

  it('accepts the other filters while a category is active', () => {
    for (const filter of ['all', 'issues', 'failed'] as const) {
      expect(isFilterCompatibleWithCategory(filter, 'blocked')).toBe(true)
    }
  })

  it('every incompatible pair really does yield an empty table', () => {
    const mods = [
      mod({ id: 'clean', errors: [] }),
      mod({ id: 'msgs', errors: [BLOCKED] }),
      mod({ id: 'fail', failed: 2, errors: [UNTERMINATED] })
    ]
    for (const filter of ['all', 'issues', 'failed', 'clean'] as const) {
      for (const category of ['blocked', 'header', 'unterminated', 'other'] as const) {
        if (isFilterCompatibleWithCategory(filter, category)) continue
        expect(filterReportMods(mods, filter, category, '')).toEqual([])
      }
    }
  })
})

describe('sortReportMods', () => {
  it('sorts by failed desc, then error count desc, then name', () => {
    const a = mod({ id: 'a', name: 'B Mod', failed: 1, errors: [] })
    const b = mod({ id: 'b', name: 'A Mod', failed: 1, errors: [] })
    const c = mod({ id: 'c', name: 'C Mod', failed: 0, errors: [UNTERMINATED, NO_HEADER] })
    const d = mod({ id: 'd', name: 'D Mod', failed: 0, errors: [] })
    expect(sortReportMods([d, c, a, b]).map(m => m.id)).toEqual(['b', 'a', 'c', 'd'])
  })
})

const BOM = '﻿'

const scanWith = async (files: Record<string, string>): Promise<string[]> => {
  const output = await scanMods(
    {
      rootDir: 'workshop',
      gameDef: stellaris,
      sourceLanguage: 'en',
      targets: [{ language: 'ru', fileToken: 'russian' }]
    },
    new MemoryFs(files)
  )
  return output.mods.flatMap(scanned => scanned.errors.concat(scanned.warnings ?? []))
}

describe('parseModError against the strings the converter actually emits', () => {
  const categoriesOf
 = async (files: Record<string, string>): Promise<RunErrorCategory[]> =>
    (await scanWith(files)).map(raw => parseModError(raw).category)

  it('recognises an unterminated value string', async () => {
    const categories = await categoriesOf({
      'workshop/a/descriptor.mod': 'name="Mod A"',
      'workshop/a/localisation/english/a_l_english.yml':
        `${BOM}l_english:\n K1:0 "never closed\n K2:0 "fine"\n`
    })
    expect(categories).toContain('unterminated')
    expect(categories).not.toContain('other')
  })

  it('recognises a file with no language header', async () => {
    const categories = await categoriesOf({
      'workshop/a/descriptor.mod': 'name="Mod A"',
      'workshop/a/localisation/english/a_l_english.yml': `${BOM} K1:0 "no header above me"\n`
    })
    expect(categories).toContain('header')

  })

  it('reads the language folder back out of the path the converter built', async () => {
    const [raw] = await scanWith({
      'workshop/a/descriptor.mod': 'name="Mod A"',
      'workshop/a/localisation/english/a_l_english.yml':
        `${BOM}l_english:\n K1:0 "never closed\n K2:0 "fine"\n`
    })
    expect(raw).toBeDefined()
    expect(parseModError(raw ?? '').languageFolder).toBe('english')
  })
})
