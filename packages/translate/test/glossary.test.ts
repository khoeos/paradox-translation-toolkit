import { describe, expect, it } from 'vitest'

import { MemoryFs } from '@ptt/converter/test/memory-fs'

import {
  MAX_HINTS_PER_BATCH,
  MAX_TERM_LENGTH,
  buildGlossary,
  collectHints,
  isUsableTerm,
  loadGlossary
} from '../src/index.js'
import type { Glossary } from '../src/index.js'
import { stellarisDef } from './fixtures.js'

const BOM = '﻿'

function localeFile(language: string, entries: Array<[string, string]>): string {
  let content = `${BOM}l_${language}:\n`
  for (const [key, value] of entries) content += ` ${key}:0 "${value}"\n`
  return content
}

/** A game install holding the same keys in English and Russian. */
function gameFs(pairs: Array<[key: string, english: string, russian: string]>): MemoryFs {
  return new MemoryFs({
    'game/game/localisation/english/base_l_english.yml': localeFile(
      'english',
      pairs.map(([key, english]) => [key, english])
    ),
    'game/game/localisation/russian/base_l_russian.yml': localeFile(
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
    // A hint holding a token would teach the model to reproduce it in the wrong place.
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
    // Left in, they teach the model that "to" is "То" and poison every batch.
    expect(isUsableTerm('there')).toBe(false)
    expect(isUsableTerm('would')).toBe(false)
  })

  it('accepts a long enough single word', () => {
    expect(isUsableTerm('Vassal')).toBe(true)
  })
})

describe('buildGlossary', () => {
  it('pairs the source and target values of the same key', async () => {
    const fs = gameFs([['K_SHIP', 'Colony Ship', 'Корабль-колония']])
    const glossary = await buildGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.exact.get('Colony Ship')).toBe('Корабль-колония')
    expect(glossary.terms.get('colony ship')).toEqual({
      source: 'colony ship',
      target: 'Корабль-колония'
    })
  })

  it('records where it was built from, so another install is not reused', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Корабль']])
    const glossary = await buildGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.builtFrom).toBe('game')
    expect(glossary.files).toBeGreaterThan(0)
  })

  it('skips a key the game does not translate', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Colony Ship']])
    const glossary = await buildGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.exact.size).toBe(0)
  })

  it('keeps the most common rendering of a term', async () => {
    // The same English term is translated by many keys; a one-off must not win.
    const fs = gameFs([
      ['K1', 'Vassal', 'Вассал'],
      ['K2', 'Vassal', 'Вассал'],
      ['K3', 'Vassal', 'Подданный']
    ])
    const glossary = await buildGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.terms.get('vassal')?.target).toBe('Вассал')
  })

  it('keeps a long string as an exact match but not as a term', async () => {
    const long = 'A sentence far too long to ever be a glossary term, by any measure at all'
    const fs = gameFs([['K', long, 'Une phrase']])
    const glossary = await buildGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.exact.has(long)).toBe(true)
    expect(glossary.terms.size).toBe(0)
  })

  it('is empty when the game folder holds nothing', async () => {
    const glossary = await buildGlossary('nowhere', stellarisDef, 'en', 'ru', new MemoryFs())
    expect(glossary.exact.size).toBe(0)
    expect(glossary.terms.size).toBe(0)
  })

  it('is empty when the target language is not installed', async () => {
    const fs = new MemoryFs({
      'game/game/localisation/english/base_l_english.yml': localeFile('english', [['K', 'Ship']])
    })
    const glossary = await buildGlossary('game', stellarisDef, 'en', 'ru', fs)
    expect(glossary.exact.size).toBe(0)
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
    files: 1
  }

  it('returns only the terms the batch actually uses', () => {
    const hints = collectHints(glossary, ['Your vassal is angry'])
    expect(hints).toEqual([{ source: 'vassal', target: 'Вассал' }])
  })

  it('returns nothing when no term occurs', () => {
    expect(collectHints(glossary, ['Nothing relevant'])).toEqual([])
  })

  it('keeps the longest match only', () => {
    // "men-at-arms" adds nothing next to "recruit men-at-arms".
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
      files: 1
    }
    const text = Array.from({ length: MAX_HINTS_PER_BATCH + 40 }, (_, i) => `term${i}`).join(' ')
    expect(collectHints(many, [text]).length).toBeLessThanOrEqual(MAX_HINTS_PER_BATCH)
  })
})

describe('loadGlossary', () => {
  it('builds and caches on the first call', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Корабль-колония']])
    const glossary = await loadGlossary(
      'cache',
      'game',
      'stellaris-en-ru',
      stellarisDef,
      'en',
      'ru',
      fs
    )
    expect(glossary.exact.get('Colony Ship')).toBe('Корабль-колония')
    expect(fs.snapshot().has('cache/stellaris-en-ru.json')).toBe(true)
  })

  it('reads the cache back on the second call', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Корабль-колония']])
    await loadGlossary('cache', 'game', 'key', stellarisDef, 'en', 'ru', fs)
    // Remove the game so only the cache can answer.
    const cache = fs.snapshot().get('cache/key.json') ?? ''
    const cacheOnly = new MemoryFs({ 'cache/key.json': cache })
    const glossary = await loadGlossary('cache', 'game', 'key', stellarisDef, 'en', 'ru', cacheOnly)
    expect(glossary.exact.get('Colony Ship')).toBe('Корабль-колония')
  })

  it('ignores a cache built from another installation', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Корабль-колония']])
    fs.seedFile(
      'cache/key.json',
      JSON.stringify({ builtFrom: '/some/other/install', files: 1, exact: [['x', 'y']], terms: [] })
    )
    const glossary = await loadGlossary('cache', 'game', 'key', stellarisDef, 'en', 'ru', fs)
    expect(glossary.exact.has('x')).toBe(false)
    expect(glossary.exact.get('Colony Ship')).toBe('Корабль-колония')
  })

  it('rebuilds when the cache is corrupt', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Корабль-колония']])
    fs.seedFile('cache/key.json', '{ truncated')
    const glossary = await loadGlossary('cache', 'game', 'key', stellarisDef, 'en', 'ru', fs)
    expect(glossary.exact.get('Colony Ship')).toBe('Корабль-колония')
  })

  it('rebuilds when the cache holds the wrong shape', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Корабль-колония']])
    fs.seedFile('cache/key.json', JSON.stringify({ builtFrom: 'game', exact: 'nope', terms: [] }))
    const glossary = await loadGlossary('cache', 'game', 'key', stellarisDef, 'en', 'ru', fs)
    expect(glossary.exact.get('Colony Ship')).toBe('Корабль-колония')
  })

  it('writes no cache when there is nothing to cache', async () => {
    const fs = new MemoryFs()
    await loadGlossary('cache', 'nowhere', 'key', stellarisDef, 'en', 'ru', fs)
    expect(fs.snapshot().has('cache/key.json')).toBe(false)
  })

  it('sanitises the cache key into a filename', async () => {
    const fs = gameFs([['K', 'Colony Ship', 'Корабль']])
    await loadGlossary('cache', 'game', 'stellaris/en:ru', stellarisDef, 'en', 'ru', fs)
    expect(fs.snapshot().has('cache/stellaris_en_ru.json')).toBe(true)
  })
})
