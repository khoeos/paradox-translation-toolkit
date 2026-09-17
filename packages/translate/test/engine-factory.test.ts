import { describe, expect, it } from 'vitest'

import { MemoryFs } from '@ptt/converter/test/memory-fs'

import { TRANSLATE_DEFAULTS, TranslationMemory, createEngineForRun } from '../src/index.js'
import type { EngineForRunOptions, TranslateConfig } from '../src/index.js'
import { ollamaAnswering } from './fake-fetch.js'
import { stellarisDef } from './fixtures.js'

const GAME_PATH = '/game'
const USER_DATA = 'ud'

const game = { ...stellarisDef, id: 'stellaris', domain: 'Stellaris, a space game' }

const cachedGlossary = (source: string, target: string): Record<string, string> => ({
  [`${USER_DATA}/glossary/stellaris-${source}-${target}.json`]: JSON.stringify({
    builtFrom: GAME_PATH,
    files: 1,
    exact: [['Colony Ship', 'Nau colonial']],
    terms: []
  })
})

const optionsFor = (
  targetLanguages: readonly string[],
  config: Partial<TranslateConfig> = {}
): Omit<EngineForRunOptions, 'memory'> => ({
  config: { ...TRANSLATE_DEFAULTS, gamePath: GAME_PATH, ...config },
  game,
  sourceLanguage: 'en',
  targetLanguages,
  userDataPath: USER_DATA
})

describe('createEngineForRun - the glossary follows the target language', () => {
  it('reuses the cached glossary of a recognized language, so the backend is never called', async () => {
    const fs = new MemoryFs(cachedGlossary('en', 'ru'))
    const fetch = ollamaAnswering({ '0': 'never asked' })
    const engine = await createEngineForRun(
      { ...optionsFor(['ru']), memory: new TranslationMemory('mem', fs) },
      fs,
      fetch.fn
    )

    const { results, stats } = await engine.translate(['Colony Ship'], 'ru')
    expect(results.get('Colony Ship')).toBe('Nau colonial')
    expect(stats.cached).toBe(1)
    expect(fetch.calls).toHaveLength(0)
  })

  it('degrades to no glossary for a free-text label rather than throwing', async () => {
    const fs = new MemoryFs(cachedGlossary('en', 'ru'))
    const fetch = ollamaAnswering({ '0': 'Nau colonial' })
    const engine = await createEngineForRun(
      { ...optionsFor(['Catalan']), memory: new TranslationMemory('mem', fs) },
      fs,
      fetch.fn
    )

    const { results, stats } = await engine.translate(['Colony Ship'], 'Catalan')
    expect(results.get('Colony Ship')).toBe('Nau colonial')
    expect(stats.cached).toBe(0)
    const body = JSON.stringify(fetch.calls[0]?.body)
    expect(body).toContain('from English to Catalan')
    expect(body).not.toContain('base game already')
  })
})

describe('createEngineForRun - the source language is not a target', () => {
  it('refuses a run whose only target is the source language', async () => {
    const fs = new MemoryFs()
    const fetch = ollamaAnswering({})
    await expect(
      createEngineForRun(
        { ...optionsFor(['en']), memory: new TranslationMemory('mem', fs) },
        fs,
        fetch.fn
      )
    ).rejects.toThrow(/at least one target language/)
  })

  it('refuses a label that normalizes to the source language', async () => {
    const fs = new MemoryFs()
    const fetch = ollamaAnswering({})
    await expect(
      createEngineForRun(
        { ...optionsFor(['English']), memory: new TranslationMemory('mem', fs) },
        fs,
        fetch.fn
      )
    ).rejects.toThrow(/at least one target language/)
  })

  it('picks the first target that is not the source language', async () => {
    const fs = new MemoryFs()
    const fetch = ollamaAnswering({ '0': 'un' })
    const engine = await createEngineForRun(
      { ...optionsFor(['en', 'fr']), memory: new TranslationMemory('mem', fs) },
      fs,
      fetch.fn
    )
    await engine.translate(['one'], 'fr')
    expect(JSON.stringify(fetch.calls[0]?.body)).toContain('from English to French')
  })
})

describe('createEngineForRun - rapidapi', () => {
  it('throws before any request when the target is not a built-in language', async () => {
    const fs = new MemoryFs()
    const fetch = ollamaAnswering({})
    await expect(
      createEngineForRun(
        {
          ...optionsFor(['Catalan'], { provider: 'rapidapi', apiKey: 'k' }),
          memory: new TranslationMemory('mem', fs)
        },
        fs,
        fetch.fn
      )
    ).rejects.toThrow(/RapidAPI provider cannot translate into "Catalan"/)
    expect(fetch.calls).toHaveLength(0)
  })

  it('builds an engine for a built-in language', async () => {
    const fs = new MemoryFs()
    const fetch = ollamaAnswering({})
    await expect(
      createEngineForRun(
        {
          ...optionsFor(['tr'], { provider: 'rapidapi', apiKey: 'k' }),
          memory: new TranslationMemory('mem', fs)
        },
        fs,
        fetch.fn
      )
    ).resolves.toBeDefined()
  })
})
