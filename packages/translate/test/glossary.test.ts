import { describe, expect, it } from 'vitest'

import type { GameContextRef } from '@ptt/converter'
import { MemoryFs } from '@ptt/converter/test/memory-fs'
import type { FsLike, LanguageCode } from '@ptt/shared'

import { loadGlossaries } from '../src/glossary-cache.js'
import { buildGlossaries, describeGlossaryProblems, glossaryToStats } from '../src/glossary.js'
import { isRecord } from '../src/guards.js'
import { MAX_HINTS_PER_BATCH, MAX_TERM_LENGTH, collectHints, isUsableTerm } from '../src/index.js'
import type { Glossary } from '../src/index.js'
import { stellarisDef } from './fixtures.js'

async function singleGlossary(
  gamePath: string,
  gameDef: GameContextRef,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  fs: FsLike
): Promise<Glossary> {
  const glossaries = await buildGlossaries(gamePath, gameDef, sourceLanguage, [targetLanguage], fs)
  return glossaries.get(targetLanguage)!
}

const BOM = '﻿'

function localeFile(language: string, entries: Array<[string, string]>): string {
  let content = `${BOM}l_${language}:\n`
  for (const [key, value] of entries) content += ` ${key}:0 "${value}"\n`
  return content
}

function gameFs(
  pairs: Array<[key: string, english: string, russian: string]>,
  layout: 'nested' | 'root' = 'nested'
): MemoryFs {
  const prefix = layout === 'nested' ? 'game/game' : 'game'
  return new MemoryFs({
    [`${prefix}/localisation/english/base_l_english.yml`]: localeFile(
      'english',
      pairs.map(([key, english]) => [key, english])
    ),
    [`${prefix}/localisation/russian/base_l_russian.yml`]: localeFile(
      'russian',
      pairs.map(([key, , russian]) => [key, russian])
    )
  })
}

describe('isUsableTerm', () => {
  it('accepts a short multi-word term', () => {
    expect(isUsableTerm('Men-at-Arms')).toBe(true)
    expect(isUsableTerm('Colony Ship')).toBe(true)
  })

  it('rejects a value longer than the cap', () => {
    expect(isUsableTerm('x'.repeat(MAX_TERM_LENGTH + 1))).toBe(false)
  })

  it('rejects an empty value', () => {
    expect(isUsableTerm('')).toBe(false)
  })

  it('rejects a sentence', () => {
    expect(isUsableTerm('one two three four five')).toBe(false)
  })

  it('rejects anything carrying markup', () => {
    expect(isUsableTerm('Gain $AMOUNT$')).toBe(false)
    expect(isUsableTerm('£energy£')).toBe(false)
  })

  it('rejects a value with no letters', () => {
    expect(isUsableTerm('12.5%')).toBe(false)
  })

  it('rejects a short single word', () => {
    expect(isUsableTerm('war')).toBe(false)
  })

  it('rejects a function word that happens to be a whole label', () => {
    expect(isUsableTerm('there')).toBe(false)
    expect(isUsableTerm('would')).toBe(false)
  })

  it('accepts a long enough single word', () => {
    expect(isUsableTerm('Vassal')).toBe(true)
  })
})

describe('buildGlossaries - single target edge cases', () => {
  it('pairs the source and target values of the same key', async () => {
    const fs = gameFs([['K_SHIP', 'Colony Ship', 'Корабль-колония']])
    const glossary = await singleGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.exact.get('Colony Ship')).toBe('Корабль-колония')
    expect(glossary.terms.get('colony ship')).toEqual({
      source: 'colony ship',
      target: 'Корабль-колония'
    })
  })

  it('records where it was built from, so another install is not reused', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Корабль']])
    const glossary = await singleGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.builtFrom).toBe('game')
    expect(glossary.files).toBeGreaterThan(0)
  })

  it('skips a key the game does not translate', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Colony Ship']])
    const glossary = await singleGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.exact.size).toBe(0)
  })

  it('keeps the most common rendering of a term', async () => {
    const fs = gameFs([
      ['K1', 'Vassal', 'Вассал'],
      ['K2', 'Vassal', 'Вассал'],
      ['K3', 'Vassal', 'Подданный']
    ])
    const glossary = await singleGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.terms.get('vassal')?.target).toBe('Вассал')
  })

  it('keeps a long string as an exact match but not as a term', async () => {
    const long = 'A sentence far too long to ever be a glossary term, by any measure at all'
    const fs = gameFs([['K', long, 'Une phrase']])
    const glossary = await singleGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.exact.has(long)).toBe(true)
    expect(glossary.terms.size).toBe(0)
  })

  it('is empty when the game folder holds nothing', async () => {
    const glossary = await singleGlossary('nowhere', stellarisDef, 'en', 'ru', new MemoryFs())
    expect(glossary.exact.size).toBe(0)
    expect(glossary.terms.size).toBe(0)
  })

  it('is empty when the target language is not installed', async () => {
    const fs = new MemoryFs({
      'game/game/localisation/english/base_l_english.yml': localeFile('english', [['K', 'Ship']])
    })
    const glossary = await singleGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.exact.size).toBe(0)
  })

  it('builds from the game root when there is no nested game folder', async () => {
    const fs = gameFs([['K_SHIP', 'Colony Ship', 'Корабль-колония']], 'root')
    const glossary = await singleGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.exact.size).toBeGreaterThan(0)
    expect(glossary.root).toBe('game')
  })

  it('prefers the nested game folder when both layouts exist', async () => {
    const fs = gameFs([['K_SHIP', 'Colony Ship', 'Корабль-колония']], 'nested')
    fs.seedFile(
      'game/localisation/english/base_l_english.yml',
      localeFile('english', [['DECOY', 'Decoy value']])
    )
    const glossary = await singleGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.root).toBe('game/game')
    expect(glossary.exact.get('Colony Ship')).toBe('Корабль-колония')
  })

  it('falls back to the game path when the nested game folder is a file', async () => {
    const fs = gameFs([['K_SHIP', 'Colony Ship', 'Корабль-колония']], 'root')
    fs.seedFile('game/game', 'a readme, not a folder')
    const glossary = await singleGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.root).toBe('game')
    expect(glossary.exact.get('Colony Ship')).toBe('Корабль-колония')
  })

  it('falls back to the game path when the nested game folder holds no localisation', async () => {
    const fs = gameFs([['K_SHIP', 'Colony Ship', 'Корабль-колония']], 'root')
    await fs.mkdir('game/game/pdx_online_assets', { recursive: true })
    const glossary = await singleGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.root).toBe('game')
    expect(glossary.exact.get('Colony Ship')).toBe('Корабль-колония')
  })

  it('accepts a root that spells localisation the other way', async () => {
    const fs = new MemoryFs({
      'game/localization/english/base_l_english.yml': localeFile('english', [['K', 'Colony Ship']]),
      'game/game/unrelated/readme.txt': 'no localisation here'
    })
    const glossary = await singleGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.root).toBe('game')
  })

  it('walks nothing and reports the problem when no candidate holds a localisation folder', async () => {
    const fs = new MemoryFs({
      'documents/a/b/c/d/notes.txt': 'x',
      'documents/a/b/c/d/deeper/more.txt': 'y'
    })
    let walked = 0
    const realReaddir = fs.readdir.bind(fs)
    fs.readdir = async path => {
      walked++
      return realReaddir(path)
    }
    const glossary = await singleGlossary('documents', stellarisDef, 'en', 'ru', fs)
    expect(glossary.files).toBe(0)
    expect(glossary.exact.size).toBe(0)
    expect(glossary.root).toBe('documents')
    expect(walked).toBe(2)
    const problems = describeGlossaryProblems({ stats: [glossaryToStats(glossary)] })
    expect(problems.length).toBeGreaterThan(0)
  })

  it('reports files at zero and keeps the given path as root when nothing is found', async () => {
    const fs = new MemoryFs()
    const glossary = await singleGlossary('nowhere', stellarisDef, 'en', 'ru', fs)
    expect(glossary.files).toBe(0)
    expect(glossary.root).toBe('nowhere')
    const problems = describeGlossaryProblems({ stats: [glossaryToStats(glossary)] })
    expect(problems.length).toBeGreaterThan(0)
  })

  it('flags a translation mod that has files but no exploitable pair', async () => {
    const fs = new MemoryFs({
      'mod/localisation/russian/patch_l_russian.yml': localeFile('russian', [
        ['K', 'Русский текст']
      ])
    })
    const glossary = await singleGlossary('mod', stellarisDef, 'en', 'ru', fs)
    expect(glossary.files).toBeGreaterThan(0)
    expect(glossary.exact.size).toBe(0)
    const problems = describeGlossaryProblems({ stats: [glossaryToStats(glossary)] })
    expect(problems.length).toBeGreaterThan(0)
  })

  it('reports nothing for a healthy glossary', async () => {
    const fs = gameFs([['K_SHIP', 'Colony Ship', 'Корабль-колония']])
    const glossary = await singleGlossary('game', stellarisDef, 'en', 'ru', fs)
    const problems = describeGlossaryProblems({ stats: [glossaryToStats(glossary)] })
    expect(problems).toEqual([])
  })

  it('is not truncated when the localisation fits the budget', async () => {
    const fs = gameFs([['K_SHIP', 'Colony Ship', 'Корабль-колония']])
    const glossary = await singleGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.truncated).toBe(false)
  })

  it('derives truncated from the structured signal readModKeys reports, not a message match', async () => {
    const size = 50 * 1024 * 1024
    const fs = new MemoryFs({
      'game/game/localisation/a_l_english.yml': localeFile('english', [['K1', 'Colony Ship']]),
      'game/game/localisation/b_l_english.yml': localeFile('english', [['K2', 'Colony Ship']]),
      'game/game/localisation/c_l_english.yml': localeFile('english', [['K3', 'Colony Ship']])
    })
    const realStat = fs.stat.bind(fs)
    fs.stat = async path =>
      path.endsWith('.yml') ? { isDirectory: false, isFile: true, size } : realStat(path)
    const glossary = await singleGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.truncated).toBe(true)
  })
})

function threeLanguageFs(): MemoryFs {
  return new MemoryFs({
    'game/game/localisation/english/base_l_english.yml': localeFile('english', [
      ['K_SHIP', 'Colony Ship']
    ]),
    'game/game/localisation/russian/base_l_russian.yml': localeFile('russian', [
      ['K_SHIP', 'Корабль-колония']
    ]),
    'game/game/localisation/french/base_l_french.yml': localeFile('french', [
      ['K_SHIP', 'Vaisseau colonial']
    ]),
    'game/game/localisation/german/base_l_german.yml': localeFile('german', [
      ['K_SHIP', 'Kolonieschiff']
    ])
  })
}

function countReads(fs: MemoryFs): () => number {
  let reads = 0
  const realRead = fs.readFile.bind(fs)
  fs.readFile = async (path, encoding) => {
    reads++
    return realRead(path, encoding)
  }
  return () => reads
}

describe('describeGlossaryProblems - no glossary was attempted', () => {
  it('names the missing game path as the cause', () => {
    const problems = describeGlossaryProblems({ stats: [], skipReason: 'no-game-path' })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('game installation path')
  })

  it('names the absence of a recognized target language as the cause', () => {
    const problems = describeGlossaryProblems({ stats: [], skipReason: 'no-glossary-target' })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('target languages')
  })

  it('names the missing application data path as the cause', () => {
    const problems = describeGlossaryProblems({ stats: [], skipReason: 'no-user-data-path' })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('application data path')
  })

  it('ignores any stats when a skip reason is given', () => {
    const problems = describeGlossaryProblems({
      stats: [
        {
          language: 'ru',
          builtFrom: 'game',
          root: 'game',
          files: 0,
          exact: 0,
          terms: 0,
          truncated: false
        }
      ],
      skipReason: 'no-game-path'
    })
    expect(problems).toHaveLength(1)
  })
})

describe('buildGlossaries', () => {
  it('derives one glossary per target language, with actually different exact translations', async () => {
    const fs = threeLanguageFs()
    const glossaries = await buildGlossaries('game', stellarisDef, 'en', ['ru', 'fr', 'de'], fs)

    expect(glossaries.get('ru')?.exact.get('Colony Ship')).toBe('Корабль-колония')
    expect(glossaries.get('fr')?.exact.get('Colony Ship')).toBe('Vaisseau colonial')
    expect(glossaries.get('de')?.exact.get('Colony Ship')).toBe('Kolonieschiff')

    const distinctValues = new Set(
      (['ru', 'fr', 'de'] as const).map(language =>
        glossaries.get(language)?.exact.get('Colony Ship')
      )
    )
    expect(distinctValues.size).toBe(3)
  })

  it('reads the filesystem the same number of times for one target language as for three', async () => {
    const single = threeLanguageFs()
    const singleReads = countReads(single)
    await buildGlossaries('game', stellarisDef, 'en', ['ru'], single)

    const multi = threeLanguageFs()
    const multiReads = countReads(multi)
    await buildGlossaries('game', stellarisDef, 'en', ['ru', 'fr', 'de'], multi)

    expect(multiReads()).toBe(singleReads())
  })
})

describe('collectHints', () => {
  const glossary: Glossary = {
    exact: new Map(),
    terms: new Map([
      ['men-at-arms', { source: 'men-at-arms', target: 'Профессионалы' }],
      ['recruit men-at-arms', { source: 'recruit men-at-arms', target: 'Набрать профессионалов' }],
      ['vassal', { source: 'vassal', target: 'Вассал' }]
    ]),
    builtFrom: '/game',
    root: '/game/game',
    files: 1,
    truncated: false,
    forLanguage: 'ru'
  }

  it('returns only the terms the batch actually uses', () => {
    const hints = collectHints(glossary, ['Your vassal is angry'])
    expect(hints).toEqual([{ source: 'vassal', target: 'Вассал' }])
  })

  it('returns nothing when no term occurs', () => {
    expect(collectHints(glossary, ['Nothing relevant'])).toEqual([])
  })

  it('keeps the longest match only', () => {
    const hints = collectHints(glossary, ['Recruit men-at-arms now'])
    expect(hints.map(h => h.source)).toEqual(['recruit men-at-arms'])
  })

  it('matches case-insensitively', () => {
    expect(collectHints(glossary, ['VASSAL'])).toHaveLength(1)
  })

  it('caps the number of hints so the prompt is not flooded', () => {
    const many: Glossary = {
      exact: new Map(),
      terms: new Map(
        Array.from({ length: MAX_HINTS_PER_BATCH + 40 }, (_, i) => [
          `term${i}`,
          { source: `term${i}`, target: `цель${i}` }
        ])
      ),
      builtFrom: '/game',
      root: '/game/game',
      files: 1,
      truncated: false,
      forLanguage: 'ru'
    }
    const text = Array.from({ length: MAX_HINTS_PER_BATCH + 40 }, (_, i) => `term${i}`).join(' ')
    expect(collectHints(many, [text]).length).toBeLessThanOrEqual(MAX_HINTS_PER_BATCH)
  })
})

const cacheFileFor = (gameId: string, sourceLanguage: string, targetLanguage: string): string =>
  `cache/${`${gameId}-${sourceLanguage}-${targetLanguage}`.replace(/[^a-z0-9_-]/gi, '_')}.json`

describe('loadGlossaries', () => {
  it('builds and caches on the first call', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Корабль-колония']])
    const glossaries = await loadGlossaries(
      'cache',
      'game',
      'stellaris',
      stellarisDef,
      'en',
      ['ru'],
      fs
    )
    expect(glossaries.get('ru')?.exact.get('Colony Ship')).toBe('Корабль-колония')
    expect(fs.snapshot().has(cacheFileFor('stellaris', 'en', 'ru'))).toBe(true)
  })

  it('reads the cache back on the second call', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Корабль-колония']])
    await loadGlossaries('cache', 'game', 'stellaris', stellarisDef, 'en', ['ru'], fs)
    const file = cacheFileFor('stellaris', 'en', 'ru')
    const cache = fs.snapshot().get(file) ?? ''
    const cacheOnly = new MemoryFs({ [file]: cache })
    const glossaries = await loadGlossaries(
      'cache',
      'game',
      'stellaris',
      stellarisDef,
      'en',
      ['ru'],
      cacheOnly
    )
    expect(glossaries.get('ru')?.exact.get('Colony Ship')).toBe('Корабль-колония')
  })

  it('ignores a cache built from another installation', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Корабль-колония']])
    fs.seedFile(
      cacheFileFor('stellaris', 'en', 'ru'),
      JSON.stringify({ builtFrom: '/some/other/install', files: 1, exact: [['x', 'y']], terms: [] })
    )
    const glossaries = await loadGlossaries(
      'cache',
      'game',
      'stellaris',
      stellarisDef,
      'en',
      ['ru'],
      fs
    )
    expect(glossaries.get('ru')?.exact.has('x')).toBe(false)
    expect(glossaries.get('ru')?.exact.get('Colony Ship')).toBe('Корабль-колония')
  })

  it('rebuilds when the cache is corrupt', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Корабль-колония']])
    fs.seedFile(cacheFileFor('stellaris', 'en', 'ru'), '{ truncated')
    const glossaries = await loadGlossaries(
      'cache',
      'game',
      'stellaris',
      stellarisDef,
      'en',
      ['ru'],
      fs
    )
    expect(glossaries.get('ru')?.exact.get('Colony Ship')).toBe('Корабль-колония')
  })

  it('rebuilds when the cache holds the wrong shape', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Корабль-колония']])
    fs.seedFile(
      cacheFileFor('stellaris', 'en', 'ru'),
      JSON.stringify({ builtFrom: 'game', exact: 'nope', terms: [] })
    )
    const glossaries = await loadGlossaries(
      'cache',
      'game',
      'stellaris',
      stellarisDef,
      'en',
      ['ru'],
      fs
    )
    expect(glossaries.get('ru')?.exact.get('Colony Ship')).toBe('Корабль-колония')
  })

  it('writes no cache when there is nothing to cache', async () => {
    const fs = new MemoryFs()
    await loadGlossaries('cache', 'nowhere', 'stellaris', stellarisDef, 'en', ['ru'], fs)
    expect(fs.snapshot().has(cacheFileFor('stellaris', 'en', 'ru'))).toBe(false)
  })

  it('sanitises the cache key into a filename', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Корабль']])
    await loadGlossaries('cache', 'game', 'stellaris/en:ru', stellarisDef, 'en', ['ru'], fs)
    expect(fs.snapshot().has(cacheFileFor('stellaris/en:ru', 'en', 'ru'))).toBe(true)
  })

  it('round-trips root and truncated through the cache file', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Корабль-колония']])
    await loadGlossaries('cache', 'game', 'stellaris', stellarisDef, 'en', ['ru'], fs)
    const file = cacheFileFor('stellaris', 'en', 'ru')
    const cached = fs.snapshot().get(file) ?? ''
    const parsedCache = JSON.parse(cached)
    if (!isRecord(parsedCache)) throw new Error('expected a JSON object')
    expect(parsedCache.root).toBe('game/game')
    expect(parsedCache.truncated).toBe(false)

    const cacheOnly = new MemoryFs({ [file]: cached })
    const glossaries = await loadGlossaries(
      'cache',
      'game',
      'stellaris',
      stellarisDef,
      'en',
      ['ru'],
      cacheOnly
    )
    expect(glossaries.get('ru')?.root).toBe('game/game')
    expect(glossaries.get('ru')?.truncated).toBe(false)
  })

  it('rebuilds a cache written before root existed instead of guessing its root', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Корабль-колония']], 'root')
    fs.seedFile(
      cacheFileFor('stellaris', 'en', 'ru'),
      JSON.stringify({ builtFrom: 'game', files: 1, exact: [['x', 'y']], terms: [] })
    )
    const glossaries = await loadGlossaries(
      'cache',
      'game',
      'stellaris',
      stellarisDef,
      'en',
      ['ru'],
      fs
    )
    expect(glossaries.get('ru')?.exact.get('x')).toBeUndefined()
    expect(glossaries.get('ru')?.exact.get('Colony Ship')).toBe('Корабль-колония')
    expect(glossaries.get('ru')?.root).toBe('game')
    expect(glossaries.get('ru')?.files).toBeGreaterThan(0)
  })

  it('keeps reusing a cache that carries its root', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Корабль-колония']])
    fs.seedFile(
      cacheFileFor('stellaris', 'en', 'ru'),
      JSON.stringify({
        builtFrom: 'game',
        root: 'game/game',
        files: 1,
        exact: [['x', 'y']],
        terms: []
      })
    )
    const glossaries = await loadGlossaries(
      'cache',
      'game',
      'stellaris',
      stellarisDef,
      'en',
      ['ru'],
      fs
    )
    expect(glossaries.get('ru')?.exact.get('x')).toBe('y')
    expect(glossaries.get('ru')?.root).toBe('game/game')
    expect(glossaries.get('ru')?.truncated).toBe(false)
  })
})
