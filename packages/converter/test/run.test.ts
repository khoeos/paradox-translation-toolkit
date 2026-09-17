import { describe, expect, it } from 'vitest'

import { PARTIAL_SUFFIX, runConvert } from '../src/index.js'
import type {
  ConvertRunOptions,
  JobEvent,
  ProgressPort,
  TranslationEnginePort,
  TranslationMemoryPort,
  TranslationMod
} from '../src/index.js'
import { builtIn, localeFile, stellarisGame } from './fixtures.js'
import { MemoryFs } from './memory-fs.js'

const collectingPort = (): { port: ProgressPort; events: JobEvent[] } => {
  const events: JobEvent[] = []
  return { port: { emit: event => events.push(event) }, events }
}

const warningsOf = (events: readonly JobEvent[]): string[] =>
  events.flatMap(event =>
    event.type === 'log' && event.severity === 'warning' ? [event.message] : []
  )

const countingEngine = (): { engine: TranslationEnginePort; calls: string[] } => {
  const calls: string[] = []
  const counters = { translated: 0, cached: 0, failed: 0 }
  const engine: TranslationEnginePort = {
    translate: async (values, language) => {
      calls.push(language)
      counters.translated += values.length
      return {
        results: new Map(values.map(value => [value, `${language} ${value}`])),
        stats: { translated: values.length, cached: 0, failed: 0 }
      }
    },
    refusalFor: () => undefined,
    getCounters: () => ({ ...counters })
  }
  return { engine, calls }
}

const collection = (): MemoryFs =>
  new MemoryFs({
    'workshop/mymod/descriptor.mod': 'name="My Mod"\nsupported_version="1.19.0.6"',
    'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [
      ['K1', 'one'],
      ['K2', 'two']
    ]),
    'workshop/mymod/localisation/a_l_russian.yml': localeFile('russian', [['K1', 'один']])
  })

const natural = 'workshop/mymod/localisation/a_l_russian.yml'

const runOptions = (over: Partial<ConvertRunOptions> = {}): ConvertRunOptions => ({
  jobId: 'job-1',
  rootDir: 'workshop',
  game: stellarisGame,
  sourceLanguage: 'en',
  targets: builtIn('ru'),
  mode: 'add-to-current',
  cancellation: { requested: false },
  ...over
})

const generatedMod: TranslationMod = {
  name: 'Missing Translations',
  folder: 'missing_translations',
  path: 'documents/mod/missing_translations',
  supportedVersion: '1.19.0.6'
}

describe('runConvert - add to current', () => {
  it('replaces the existing translation end to end under regenerate-file', async () => {
    const fs = collection()
    const { port, events } = collectingPort()
    const { output } = await runConvert(runOptions({ targetContent: 'regenerate-file' }), fs, port)

    expect(output.totals.created).toBe(1)
    const written = fs.snapshot().get(natural)
    expect(written).toContain('K1')
    expect(written).toContain('K2')
    expect(written).not.toContain('один')
    expect(fs.snapshot().get(`${natural}.bak`)).toContain('один')
    expect([...fs.snapshot().keys()].some(path => path.includes(PARTIAL_SUFFIX))).toBe(false)
    expect(events.some(event => event.type === 'mod-progress')).toBe(true)
  })
})

describe('runConvert - target content per mode', () => {
  it('forces missing-keys when building the translation mod', async () => {
    const fs = collection()
    const { port } = collectingPort()
    await runConvert(
      runOptions({
        mode: 'create-translation-mod',
        targetContent: 'regenerate-file',
        generatedMod,
        generatedModsDir: 'documents/mod'
      }),
      fs,
      port
    )

    const produced = [...fs.snapshot().entries()].filter(
      ([path]) => path.includes('missing_translations') && path.endsWith('.yml')
    )
    expect(produced).toHaveLength(1)
    expect(produced[0]![1]).toContain('K2')
    expect(produced[0]![1]).not.toContain('K1')
    expect(fs.snapshot().get(natural)).toContain('один')
    expect([...fs.snapshot().keys()].some(path => path.endsWith('.bak'))).toBe(false)
  })

  it('forces missing-keys when extracting to a folder', async () => {
    const fs = collection()
    const { port } = collectingPort()
    await runConvert(
      runOptions({
        mode: 'extract-to-folder',
        outputDir: 'out',
        targetContent: 'complete-file'
      }),
      fs,
      port
    )

    const extracted = [...fs.snapshot().entries()].filter(([path]) => path.startsWith('out/'))
    expect(extracted).toHaveLength(1)
    expect(extracted[0]![0]).toContain(PARTIAL_SUFFIX)
    expect(extracted[0]![1]).toContain('K2')
    expect(extracted[0]![1]).not.toContain('K1')
    expect(fs.snapshot().get(natural)).toContain('один')
  })
})

const turkishAsEnglish = [{ language: 'tr', fileToken: 'english' }] as const

const sourceFile = 'workshop/mymod/localisation/a_l_english.yml'

describe('runConvert - adding a shadowing target to the current mod', () => {
  it('replaces the owner files under a replacing content, saying so instead of throwing', async () => {
    const fs = collection()
    const { port, events } = collectingPort()
    const { engine } = countingEngine()
    const { output } = await runConvert(
      runOptions({ targets: turkishAsEnglish, engine, targetContent: 'complete-file' }),
      fs,
      port
    )

    expect(output.totals.created).toBe(1)
    const written = fs.snapshot().get(sourceFile)
    expect(written?.replace('﻿', '').split('\n')[0]).toBe('l_english:')
    expect(written).toContain('tr one')
    expect(fs.snapshot().get(`${sourceFile}.bak`)).toContain('one')
    expect(warningsOf(events).join('\n')).toContain(
      'Turkish written under "l_english" replaces the English files inside the mod'
    )
    expect(output.mods[0]?.warnings?.join('\n')).toContain('replaces the English files')
    expect(output.mods[0]?.errors).toEqual([])
  })

  it('only creates what the mod lacks under missing-keys, and says that instead', async () => {
    const fs = collection()
    const { port, events } = collectingPort()
    const { engine } = countingEngine()
    const { output } = await runConvert(runOptions({ targets: turkishAsEnglish, engine }), fs, port)

    expect(output.totals.created).toBe(0)
    expect(output.totals.skipped).toBe(1)
    expect(fs.snapshot().get(sourceFile)).toContain('one')
    expect([...fs.snapshot().keys()].some(path => path.endsWith('.bak'))).toBe(false)
    expect(warningsOf(events).join('\n')).toContain(
      'Turkish written under "l_english" only creates the English files the mod does not already have'
    )
    expect(output.mods[0]?.errors).toEqual([])
  })
})

describe('runConvert - a target writing under another language file name', () => {
  it('drops it with a warning when there is no engine to translate with', async () => {
    const fs = collection()
    const { port, events } = collectingPort()
    const { output } = await runConvert(
      runOptions({
        targets: turkishAsEnglish,
        mode: 'create-translation-mod',
        generatedMod,
        generatedModsDir: 'documents/mod'
      }),
      fs,
      port
    )

    expect(output.totals.created).toBe(0)
    expect([...fs.snapshot().keys()].some(path => path.includes('missing_translations'))).toBe(
      false
    )
    const warning = events.find(event => event.type === 'log' && event.severity === 'warning')
    expect(warning).toBeDefined()
    expect(warning?.type === 'log' && warning.message).toContain('needs a translation engine')
  })

  it('writes it under the shadowed file name when an engine is there', async () => {
    const fs = collection()
    const { port } = collectingPort()
    const { engine } = countingEngine()
    const { output } = await runConvert(
      runOptions({
        targets: turkishAsEnglish,
        mode: 'create-translation-mod',
        generatedMod,
        generatedModsDir: 'documents/mod',
        engine
      }),
      fs,
      port
    )

    expect(output.totals.created).toBe(1)
    expect(output.mods[0]?.created.tr).toEqual([
      'documents/mod/missing_translations/localisation/english/mymod_my_mod/a_l_english.yml'
    ])
    const written = fs
      .snapshot()
      .get('documents/mod/missing_translations/localisation/english/mymod_my_mod/a_l_english.yml')
    expect(written?.replace('﻿', '').split('\n')[0]).toBe('l_english:')
    expect(written).toContain('tr one')
    expect(written).toContain('tr two')
  })
})

describe('runConvert - the target list', () => {
  it('reports back the targets it was asked for', async () => {
    const fs = collection()
    const { port } = collectingPort()
    const { output } = await runConvert(runOptions({ targets: builtIn('ru', 'fr') }), fs, port)
    expect(output.targets).toEqual([
      { language: 'ru', fileToken: 'russian' },
      { language: 'fr', fileToken: 'french' }
    ])
  })

  it('reports them back on a cancelled run too', async () => {
    const fs = collection()
    const { port } = collectingPort()
    const { output } = await runConvert(runOptions({ cancellation: { requested: true } }), fs, port)
    expect(output.cancelled).toBe(true)
    expect(output.targets).toEqual([{ language: 'ru', fileToken: 'russian' }])
  })

  it('reports the normalized spelling, not the one it was handed', async () => {
    const fs = collection()
    const { port } = collectingPort()
    const { output } = await runConvert(
      runOptions({ targets: [{ language: 'Turkish', fileToken: 'english' }] }),
      fs,
      port
    )
    expect(output.targets).toEqual([{ language: 'tr', fileToken: 'english' }])
  })

  it('normalizes the list of a cancelled run too', async () => {
    const fs = collection()
    const { port } = collectingPort()
    const { output } = await runConvert(
      runOptions({
        targets: [{ language: 'Russian', fileToken: 'russian' }],
        cancellation: { requested: true }
      }),
      fs,
      port
    )
    expect(output.targets).toEqual([{ language: 'ru', fileToken: 'russian' }])
  })

  it('translates each language of a two-language run exactly once', async () => {
    const fs = collection()
    const { port } = collectingPort()
    const { engine, calls } = countingEngine()
    await runConvert(
      runOptions({
        targets: builtIn('ru', 'fr'),
        mode: 'create-translation-mod',
        generatedMod,
        generatedModsDir: 'documents/mod',
        engine
      }),
      fs,
      port
    )
    expect(calls.toSorted()).toEqual(['fr', 'ru'])
  })
})

describe('runConvert - a free-text target language', () => {
  const generatedEnglish =
    'documents/mod/missing_translations/localisation/english/mymod_my_mod/a_l_english.yml'

  it('hands the label verbatim to the engine and to the translation memory', async () => {
    const fs = collection()
    fs.seedFile(generatedEnglish, localeFile('english', [['K1', 'one']]))
    const { port } = collectingPort()
    const { engine, calls } = countingEngine()
    const asked: string[] = []
    const memory: TranslationMemoryPort = {
      get: language => {
        asked.push(language)
        return undefined
      }
    }

    const { output } = await runConvert(
      runOptions({
        targets: [{ language: 'Catalan', fileToken: 'english' }],
        mode: 'create-translation-mod',
        generatedMod,
        generatedModsDir: 'documents/mod',
        engine,
        memory
      }),
      fs,
      port
    )

    expect(calls).toEqual(['Catalan'])
    expect(asked).toEqual(['Catalan'])
    expect(output.targets).toEqual([{ language: 'Catalan', fileToken: 'english' }])
    expect(Object.keys(output.mods[0]?.created ?? {})).toEqual(['Catalan'])
  })

  it('names the file token on a refusal row, like the audit report does', async () => {
    const fs = collection()
    const { port } = collectingPort()
    const refusing: TranslationEnginePort = {
      translate: async () => ({
        results: new Map(),
        stats: { translated: 0, cached: 0, failed: 1 }
      }),
      refusalFor: () => ({ value: 'one', language: 'Catalan', reason: 'markup' }),
      getCounters: () => ({ translated: 0, cached: 0, failed: 1 })
    }

    const { untranslated } = await runConvert(
      runOptions({
        targets: [{ language: 'Catalan', fileToken: 'french' }],
        mode: 'create-translation-mod',
        generatedMod,
        generatedModsDir: 'documents/mod',
        engine: refusing
      }),
      fs,
      port
    )

    expect(untranslated.length).toBeGreaterThan(0)
    expect(untranslated.every(row => row.fileToken === 'french')).toBe(true)
  })
})
