import { beforeEach, describe, expect, it } from 'vitest'


import {
  PARTIAL_SUFFIX,
  SCAN_DIAGNOSTICS_PER_MOD,
  retranslateOwnKeysHasNoEffect,
  runConvert,
  settledCount
} from '../src/index.js'

import type {
  ConvertRunOptions,
  JobEvent,
  ProgressPort,
  RunReportPort,
  TranslationEnginePort,

  TranslationMemoryPort,
  TranslationMod,
  TranslationSetup,
  TranslationSetupPort
} from '../src/index.js'



import { builtIn, localeFile, staticSetup, stellarisGame } from './fixtures.js'

import { MemoryFs } from './memory-fs.js'

const collectingPort = (): { port: ProgressPort; events: JobEvent[] } => {
  const events: JobEvent[] = []
  return { port: { emit: event => events.push(event) }, events }
}

const warningsOf = (events: readonly JobEvent[]): string[] =>
  events.flatMap(event =>
    event.type === 'log' && event.severity === 'warning' ? [event.message] : []
  )

const errorsOf = (events: readonly JobEvent[]): string[] =>
  events.flatMap(event =>
    event.type === 'log' && event.severity === 'error' ? [event.message] : []
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
    getCounters: () => ({ ...counters }),
    isBackendDown: () => false
  }
  return { engine, calls }
}

const recordingEngine = (): { engine: TranslationEnginePort; values: string[] } => {
  const values: string[] = []
  const counters = { translated: 0, cached: 0, failed: 0 }
  const engine: TranslationEnginePort = {
    translate: async (vals, language) => {
      values.push(...vals)
      counters.translated += vals.length
      return {
        results: new Map(vals.map(value => [value, `${language} ${value}`])),
        stats: { translated: vals.length, cached: 0, failed: 0 }
      }
    },
    refusalFor: () => undefined,
    getCounters: () => ({ ...counters }),
    isBackendDown: () => false
  }
  return { engine, values }
}

const identicalEngine = (): TranslationEnginePort => ({
  translate: async values => ({
    results: new Map(values.map(value => [value, value])),
    stats: { translated: values.length, cached: 0, failed: 0 }
  }),
  refusalFor: () => undefined,
  getCounters: () => ({ translated: 0, cached: 0, failed: 0 }),
  isBackendDown: () => false
})

const downEngine = (): TranslationEnginePort => ({
  translate: async values => ({
    results: new Map(),
    stats: { translated: 0, cached: 0, failed: values.length }
  }),
  refusalFor: () => ({ reason: 'backend down' }),
  getCounters: () => ({ translated: 0, cached: 0, failed: 0 }),
  isBackendDown: () => true
})

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

type RunOverrides
 = Partial<ConvertRunOptions> & TranslationSetup

const runOptions = (over: RunOverrides = {}): ConvertRunOptions => {
  const { engine, memory, glossaryProblems, flush, ...rest } = over
  const setup: TranslationSetup = {
    ...(engine !== undefined && { engine }),
    ...(memory !== undefined && { memory }),
    ...(glossaryProblems !== undefined && { glossaryProblems }),
    ...(flush !== undefined && { flush })
  }
  return {
    jobId: 'job-1',
    rootDir: 'workshop',
    game: stellarisGame,
    sourceLanguage: 'en',
    targets: builtIn('ru'),
    mode: 'add-to-current',
    cancellation: { requested: false },
    ...(Object.keys(setup).length > 0 && { translationSetup: staticSetup(setup) }),
    ...rest
  }
}


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
      getCounters: () => ({ translated: 0, cached: 0, failed: 1 }),
      isBackendDown: () => false
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

const brokenFile = (id: string): string => `﻿l_english:\n K_${id}:0 "never closed\n`

const brokenCollection = (fileCount: number): MemoryFs => {
  const files: Record<string, string> = { 'workshop/mymod/descriptor.mod': 'name="My Mod"' }
  for (let i = 0; i < fileCount; i++) {
    files[`workshop/mymod/localisation/f${i}_l_english.yml`] = brokenFile(String(i))
  }
  return new MemoryFs(files)
}

describe('runConvert - plan.errors become log events', () => {
  it('names the mod on every error, and caps them per mod with a summary line', async () => {
    const fs = brokenCollection(SCAN_DIAGNOSTICS_PER_MOD + 2)
    const { port, events } = collectingPort()
    await runConvert(runOptions(), fs, port)

    const errors = errorsOf(events)
    expect(errors).toHaveLength(SCAN_DIAGNOSTICS_PER_MOD)
    expect(errors.every(message => message.startsWith('My Mod :'))).toBe(true)

    const summary = warningsOf(events).find(message => message.includes('more problem'))
    expect(summary).toContain('My Mod :')
  })
})

const twoMods = (): MemoryFs =>
  new MemoryFs({
    'workshop/mod1/descriptor.mod': 'name="Mod One"',
    'workshop/mod1/localisation/a_l_english.yml': localeFile('english', [['K1', 'one']]),
    'workshop/mod2/descriptor.mod': 'name="Mod Two"',
    'workshop/mod2/localisation/a_l_english.yml': localeFile('english', [['K1', 'two']])
  })

describe('runConvert - backend down', () => {
  it('warns exactly once across two mods whose engine reports itself unavailable', async () => {
    const fs = twoMods()
    const { port, events } = collectingPort()
    await runConvert(runOptions({ engine: downEngine() }), fs, port)

    const backendWarnings = warningsOf(events).filter(message => message.includes('backend'))
    expect(backendWarnings).toHaveLength(1)
  })
})

describe('runConvert - a response identical to the source', () => {
  it('flags it as english/identical without touching the failed counter', async () => {
    const fs = collection()
    const { port } = collectingPort()
    const { untranslated, output } = await runConvert(
      runOptions({ engine: identicalEngine() }),
      fs,
      port
    )

    const entry = untranslated.find(row => row.key === 'K2')
    expect(entry).toMatchObject({ state: 'english', reason: 'identical', identicalToSource: true })
    expect(output.mods[0]?.translation?.failed).toBe(0)
  })

  it('produces no entry when the engine returns a real translation', async () => {
    const fs = collection()
    const { port } = collectingPort()
    const { engine } = countingEngine()
    const { untranslated } = await runConvert(runOptions({ engine }), fs, port)
    expect(untranslated).toEqual([])
  })
})

const ownIdentical = (): MemoryFs =>
  new MemoryFs({
    'workshop/mymod/descriptor.mod': 'name="My Mod"',
    'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [['K1', 'one']]),
    'workshop/mymod/localisation/a_l_russian.yml': localeFile('russian', [['K1', 'one']])
  })

describe('runConvert - retranslateOwnKeys', () => {
  it('by default never sends an own key identical to the source to the engine', async () => {
    const fs = ownIdentical()
    const { port } = collectingPort()
    const { engine, values } = recordingEngine()
    await runConvert(runOptions({ engine }), fs, port)
    expect(values).toEqual([])
  })

  it('has no effect under add-to-current with complete-file, warns, and never duplicates the key', async () => {
    const fs = ownIdentical()
    const { port, events } = collectingPort()
    const { engine, values } = recordingEngine()
    await runConvert(
      runOptions({
        engine,
        mode: 'add-to-current',
        targetContent: 'complete-file',
        retranslateOwnKeys: true
      }),
      fs,
      port
    )
    expect(values).toEqual([])
    expect(warningsOf(events).some(message => message.includes('no effect'))).toBe(true)
    const files = [...fs.snapshot().keys()].filter(path => path.endsWith('.yml'))
    expect(files).toEqual([
      'workshop/mymod/localisation/a_l_english.yml',
      'workshop/mymod/localisation/a_l_russian.yml'
    ])
    expect(fs.snapshot().get('workshop/mymod/localisation/a_l_russian.yml')).toContain('one')
  })

  it('has no effect under add-to-current with regenerate-file beyond the warning itself', async () => {
    const run = async (
      retranslateOwnKeys: boolean
    ): Promise<{ values: string[]; warned: boolean }> => {
      const fs = ownIdentical()
      const { port, events } = collectingPort()
      const { engine, values } = recordingEngine()
      await runConvert(
        runOptions({
          engine,
          mode: 'add-to-current',
          targetContent: 'regenerate-file',
          retranslateOwnKeys
        }),
        fs,
        port
      )
      return { values, warned: warningsOf(events).some(message => message.includes('no effect')) }
    }
    const off = await run(false)
    const on = await run(true)
    expect(on.values).toEqual(off.values)
    expect(off.warned).toBe(false)
    expect(on.warned).toBe(true)
  })

  it('still applies in create-translation-mod, sending the own key and writing the translation', async () => {
    const fs = ownIdentical()
    const { port, events } = collectingPort()
    const { engine } = recordingEngine()
    await runConvert(
      runOptions({
        engine,
        mode: 'create-translation-mod',
        generatedMod,
        generatedModsDir: 'documents/mod',
        retranslateOwnKeys: true
      }),
      fs,
      port
    )
    expect(warningsOf(events).some(message => message.includes('no effect'))).toBe(false)
    const produced = [...fs.snapshot().entries()].find(
      ([path]) => path.includes('missing_translations') && path.endsWith('.yml')
    )
    expect(produced?.[1]).toContain('ru one')
  })

  it('never sends an own key whose value is not translatable', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/descriptor.mod': 'name="My Mod"',
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [['K1', '$COUNT$']]),
      'workshop/mymod/localisation/a_l_russian.yml': localeFile('russian', [['K1', '$COUNT$']])
    })
    const { port } = collectingPort()
    const { engine, values } = recordingEngine()
    await runConvert(
      runOptions({
        engine,
        mode: 'add-to-current',
        targetContent: 'regenerate-file',
        retranslateOwnKeys: true
      }),
      fs,
      port
    )
    expect(values).toEqual([])
  })

  it('has no effect under add-to-current with missing-keys, and warns once', async () => {
    const fs = ownIdentical()
    const { port, events } = collectingPort()
    const { engine, values } = recordingEngine()
    await runConvert(runOptions({ engine, retranslateOwnKeys: true }), fs, port)
    expect(values).toEqual([])
    expect(warningsOf(events).some(message => message.includes('no effect'))).toBe(true)
  })
})

describe('retranslateOwnKeysHasNoEffect', () => {
  it('is true for add-to-current, where our own keys are the target', () => {
    expect(retranslateOwnKeysHasNoEffect('add-to-current')).toBe(true)
  })

  it('is false for create-translation-mod and extract-to-folder', () => {
    expect(retranslateOwnKeysHasNoEffect('create-translation-mod')).toBe(false)
    expect(retranslateOwnKeysHasNoEffect('extract-to-folder')).toBe(false)
  })
})

describe('runConvert - the sequence around the run', () => {
  const trace: string[] = []

  const tracingSetup = (over: Partial<TranslationSetup> = {}): TranslationSetupPort => ({
    open: request => {
      trace.push(`open ${request.sourceLanguage} -> ${request.targetLanguages.join(',')}`)
      return Promise.resolve({
        flush: () => {
          trace.push('flush')
          return Promise.resolve()
        },
        ...over
      })
    }
  })

  const tracingReport = (): RunReportPort => ({
    write: facts => {
      trace.push(`write ${facts.output.totals.mods} mods, ${facts.untranslated.length} untranslated`)
      return Promise.resolve({ jsonPath: '/data/reports/run.json', file: 'run.json' })
    }
  })

  beforeEach(() => {
    trace.length = 0
  })

  it('opens the setup, runs, flushes the memory, then writes the report', async () => {
    const { port } = collectingPort()
    await runConvert(
      runOptions({ translationSetup: tracingSetup(), runReport: tracingReport() }),
      collection(),
      port
    )
    expect(trace).toEqual(['open en -> ru', 'flush', 'write 1 mods, 0 untranslated'])
  })

  it('puts the written report on the output, which is how both front ends find it', async () => {
    const { port } = collectingPort()
    const { output } = await runConvert(
      runOptions({ runReport: tracingReport() }),
      collection(),
      port
    )
    expect(output.reportPath).toBe('/data/reports/run.json')
    expect(output.reportFile).toBe('run.json')
  })

  it('leaves the report fields alone when no report port was given', async () => {
    const { port } = collectingPort()
    const { output } = await runConvert(runOptions(), collection(), port)
    expect(output.reportPath).toBeUndefined()
    expect(output.reportFile).toBeUndefined()
  })

  it('leaves them alone when the port declines to write', async () => {
    const { port } = collectingPort()
    const declining: RunReportPort = { write: () => Promise.resolve(undefined) }
    const { output } = await runConvert(
      runOptions({ runReport: declining }),
      collection(),
      port
    )
    expect(output.reportPath).toBeUndefined()
  })

  it('emits the glossary problems as warnings before the first mod is touched', async () => {
    const { port, events } = collectingPort()
    await runConvert(
      runOptions({ translationSetup: tracingSetup({ glossaryProblems: ['no game path'] }) }),
      collection(),
      port
    )
    const warned = events.findIndex(e => e.type === 'log' && e.message === 'no game path')
    const firstProgress = events.findIndex(e => e.type === 'mod-progress')
    expect(warned).toBeGreaterThanOrEqual(0)
    expect(warned).toBeLessThan(firstProgress)
  })

  it('still flushes and reports a cancelled run, so nothing translated is lost', async () => {
    const { port } = collectingPort()
    const { output } = await runConvert(
      runOptions({
        cancellation: { requested: true },
        translationSetup: tracingSetup(),
        runReport: tracingReport()
      }),
      collection(),
      port
    )
    expect(output.cancelled).toBe(true)
    expect(trace).toEqual(['open en -> ru', 'flush', 'write 0 mods, 0 untranslated'])
  })

  it('asks the setup for the target languages the run was given', async () => {
    const { port } = collectingPort()
    await runConvert(
      runOptions({
        targets: [
          { language: 'Russian', fileToken: 'russian' },
          { language: 'tr', fileToken: 'turkish' }
        ],
        translationSetup: tracingSetup()
      }),
      collection(),
      port
    )
    expect(trace[0]).toBe('open en -> ru,tr')
  })
})

const dedupingMods = (): MemoryFs =>
  new MemoryFs({
    'workshop/a/descriptor.mod': 'name="Mod A"',
    'workshop/a/localisation/english/a_l_english.yml': localeFile('english', [
      ['K1', 'Colony Ship'],
      ['K2', 'Science Ship'],
      ['K3', 'Colony Ship']
    ]),
    'workshop/b/descriptor.mod': 'name="Mod B"',
    'workshop/b/localisation/english/b_l_english.yml': localeFile('english', [
      ['K4', 'Star Fortress']
    ])
  })

const translateModEvents = (
  events: readonly JobEvent[]
): Array<Extract<JobEvent, { type: 'translate-mod' }>> =>
  events.filter(event => event.type === 'translate-mod')

describe('runConvert - per-mod translation progress', () => {
  it('announces each mod with the number of distinct strings it will send', async () => {
    const { port, events } = collectingPort()
    const { engine } = countingEngine()
    await runConvert(runOptions({ engine, mode: 'create-translation-mod' }), dedupingMods(), port)

    expect(
      translateModEvents(events)
        .map(event => [event.modName, event.total])
        .toSorted()
    ).toEqual([
      ['Mod A', 2],
      ['Mod B', 1]
    ])
  })

  it('names the target language, since a mod is announced once per language', async () => {
    const { port, events } = collectingPort()
    const { engine } = countingEngine()
    await runConvert(
      runOptions({ engine, targets: builtIn('ru', 'fr'), mode: 'create-translation-mod' }),
      dedupingMods(),
      port
    )

    const languages = new Set(translateModEvents(events).map(event => event.language))
    expect([...languages].toSorted()).toEqual(['fr', 'ru'])
  })

  it('carries the counter baseline, so the renderer can restart from zero per mod', async () => {
    const { port, events } = collectingPort()
    const { engine } = countingEngine()
    await runConvert(runOptions({ engine, mode: 'create-translation-mod' }), dedupingMods(), port)

    const baselines = translateModEvents(events).map(event => event.done)
    expect(baselines[0]).toBe(0)
    expect(baselines.every(done => done >= 0)).toBe(true)
  })

  it('announces the mod before the first progress report for it', async () => {
    const { port, events } = collectingPort()
    const { engine } = countingEngine()
    await runConvert(runOptions({ engine, mode: 'create-translation-mod' }), dedupingMods(), port)

    const firstAnnounce = events.findIndex(event => event.type === 'translate-mod')
    const firstProgress = events.findIndex(event => event.type === 'translate-progress')
    expect(firstAnnounce).toBeGreaterThanOrEqual(0)
    expect(firstAnnounce).toBeLessThan(firstProgress)
  })

  it('says nothing when there is no engine to translate with', async () => {
    const { port, events } = collectingPort()
    await runConvert(runOptions({ mode: 'create-translation-mod' }), dedupingMods(), port)
    expect(translateModEvents(events)).toEqual([])
  })
})

describe('settledCount', () => {
  it('adds the three outcomes the engine reports', () => {
    expect(settledCount({ translated: 1, cached: 2, failed: 3 })).toBe(6)
  })
})
