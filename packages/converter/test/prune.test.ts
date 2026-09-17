import { describe, expect, it } from 'vitest'

import type { TranslationTarget } from '@ptt/shared'

import { pathKey, pruneNamespace, resolveTargets, runConvert, scanMods } from '../src/index.js'
import type {
  ConvertRunOptions,
  ProgressPort,
  PruneOptions,
  ResolvedTarget,
  TranslationEnginePort,
  TranslationMod
} from '../src/index.js'
import { localeFile, stellarisDef, stellarisGame } from './fixtures.js'
import { MemoryFs } from './memory-fs.js'

const translationMod: TranslationMod = {
  name: 'Missing Translations',
  folder: 'missing_translations',
  path: 'documents/mod/missing_translations',
  supportedVersion: '1.19.0.6'
}

const NAMESPACE = 'mymod_my_mod'
const under = (token: string, file: string): string =>
  `documents/mod/missing_translations/localisation/${token}/${NAMESPACE}/${file}`

const turkishAsEnglish = [{ language: 'tr', fileToken: 'english' }] as const

const catalanAsEnglish = [{ language: 'Catalan', fileToken: 'english' }] as const

const resolvedFor = (targets: readonly TranslationTarget[]): ResolvedTarget[] =>
  resolveTargets(stellarisDef, 'en', targets).targets

const pruneOptions = (over: Partial<PruneOptions> = {}): PruneOptions => ({
  translationMod,
  gameDef: stellarisDef,
  namespace: NAMESPACE,
  targets: resolvedFor(turkishAsEnglish),
  produced: new Map(),
  ...over
})

describe('pruneNamespace', () => {
  it('walks the folder of the token the target writes, not of its language', async () => {
    const fs = new MemoryFs({
      [under('english', 'a_l_english.yml')]: localeFile('english', [['K', 'metin']]),
      [under('english', 'old_l_english.yml')]: localeFile('english', [['OLD', 'eski']]),
      [under('turkish', 'a_l_turkish.yml')]: localeFile('turkish', [['K', 'metin']])
    })

    const report = await pruneNamespace(
      pruneOptions({
        produced: new Map([['tr', new Set([pathKey(under('english', 'a_l_english.yml'))])]])
      }),
      fs
    )

    expect(report.removed).toBe(1)
    expect(report.errors).toEqual([])
    expect(fs.snapshot().has(under('english', 'a_l_english.yml'))).toBe(true)
    expect(fs.snapshot().has(under('english', 'old_l_english.yml'))).toBe(false)
    expect(fs.snapshot().has(under('turkish', 'a_l_turkish.yml'))).toBe(true)
  })

  it('removes everything when the run produced nothing for that language', async () => {
    const fs = new MemoryFs({
      [under('english', 'a_l_english.yml')]: localeFile('english', [['K', 'metin']])
    })
    const report = await pruneNamespace(pruneOptions(), fs)
    expect(report.removed).toBe(1)
    expect(fs.snapshot().has(under('english', 'a_l_english.yml'))).toBe(false)
  })

  it('leaves the folder of a token no target writes alone', async () => {
    const fs = new MemoryFs({
      [under('russian', 'a_l_russian.yml')]: localeFile('russian', [['K', 'текст']])
    })
    const report = await pruneNamespace(pruneOptions(), fs)
    expect(report.removed).toBe(0)
    expect(fs.snapshot().has(under('russian', 'a_l_russian.yml'))).toBe(true)
  })

  it('leaves another namespace alone', async () => {
    const other =
      'documents/mod/missing_translations/localisation/english/other_mod/x_l_english.yml'
    const fs = new MemoryFs({ [other]: localeFile('english', [['X', 'iks']]) })
    const report = await pruneNamespace(pruneOptions(), fs)
    expect(report.removed).toBe(0)
    expect(fs.snapshot().has(other)).toBe(true)
  })

  it('reports a file it could not remove', async () => {
    const fs = new MemoryFs({
      [under('english', 'a_l_english.yml')]: localeFile('english', [['K', 'metin']])
    })
    fs.unlink = async () => {
      throw new Error('EACCES')
    }
    const report = await pruneNamespace(pruneOptions(), fs)
    expect(report.removed).toBe(0)
    expect(report.errors).toHaveLength(1)
    expect(report.errors[0]).toContain('EACCES')
  })

  it('keys what the run produced by the free-text label of the target', async () => {
    const fs = new MemoryFs({
      [under('english', 'a_l_english.yml')]: localeFile('english', [['K', 'text en catala']]),
      [under('english', 'old_l_english.yml')]: localeFile('english', [['OLD', 'antic']])
    })

    const report = await pruneNamespace(
      pruneOptions({
        targets: resolvedFor(catalanAsEnglish),
        produced: new Map([['Catalan', new Set([pathKey(under('english', 'a_l_english.yml'))])]])
      }),
      fs
    )

    expect(report.removed).toBe(1)
    expect(fs.snapshot().has(under('english', 'a_l_english.yml'))).toBe(true)
    expect(fs.snapshot().has(under('english', 'old_l_english.yml'))).toBe(false)
  })

  it('skips the source language, which resolveTargets never hands it', async () => {
    const fs = new MemoryFs({
      [under('english', 'a_l_english.yml')]: localeFile('english', [['K', 'text']])
    })
    const report = await pruneNamespace(
      pruneOptions({ targets: resolvedFor([{ language: 'en', fileToken: 'english' }]) }),
      fs
    )
    expect(report.removed).toBe(0)
    expect(fs.snapshot().has(under('english', 'a_l_english.yml'))).toBe(true)
  })
})

const collection = (): MemoryFs =>
  new MemoryFs({
    'workshop/mymod/descriptor.mod': 'name="My Mod"\nsupported_version="1.19.0.6"',
    'workshop/mymod/localisation/english/a_l_english.yml': localeFile('english', [
      ['K1', 'one'],
      ['K2', 'two']
    ])
  })

const silentPort: ProgressPort = { emit: () => {} }

const echoEngine = (): { engine: TranslationEnginePort; batches: number[] } => {
  const batches: number[] = []
  const counters = { translated: 0, cached: 0, failed: 0 }
  const engine: TranslationEnginePort = {
    translate: async (values, language) => {
      batches.push(values.length)
      counters.translated += values.length
      return {
        results: new Map(values.map(value => [value, `${language} ${value}`])),
        stats: { translated: values.length, cached: 0, failed: 0 }
      }
    },
    refusalFor: () => undefined,
    getCounters: () => ({ ...counters })
  }
  return { engine, batches }
}

describe('create-translation-mod, twice, with a target writing under the source file name', () => {
  const runOptions = (
    engine: TranslationEnginePort,
    targets: readonly TranslationTarget[]
  ): ConvertRunOptions => ({
    jobId: 'job-1',
    rootDir: 'workshop',
    game: stellarisGame,
    sourceLanguage: 'en',
    targets,
    mode: 'create-translation-mod',
    generatedMod: translationMod,
    generatedModsDir: 'documents/mod',
    engine,
    cancellation: { requested: false }
  })

  const scan = async (
    fs: MemoryFs,
    targets: readonly TranslationTarget[]
  ): Promise<Awaited<ReturnType<typeof scanMods>>> =>
    scanMods(
      {
        rootDir: 'workshop',
        gameDef: stellarisGame,
        sourceLanguage: 'en',
        targets,
        generatedModPath: translationMod.path,
        generatedModFolder: translationMod.folder
      },
      fs
    )

  const cases = [
    { name: 'a built-in language', targets: turkishAsEnglish, language: 'tr' },
    { name: 'a free-text language', targets: catalanAsEnglish, language: 'Catalan' }
  ] as const

  for (const { name, targets, language } of cases) {
    it(`keeps every generated file on the second pass, for ${name}`, async () => {
      const fs = collection()
      const { engine, batches } = echoEngine()
      const written = under('english', 'a_l_english.yml')

      const firstScan = await scan(fs, targets)
      expect(firstScan.targets).toEqual(targets)
      expect(firstScan.mods[0]?.missingKeys[language]).toBe(2)

      const first = await runConvert(runOptions(engine, targets), fs, silentPort)
      expect(first.output.totals.created).toBe(1)
      expect(first.output.totals.pruned).toBe(0)
      expect(fs.snapshot().get(written)).toContain(`${language} one`)
      expect(batches).toEqual([2])

      const secondScan = await scan(fs, targets)
      expect(secondScan.mods[0]?.missingKeys[language]).toBe(0)
      expect(secondScan.generatedMod?.translated).toBe(2)

      const second = await runConvert(runOptions(engine, targets), fs, silentPort)
      expect(second.output.totals.created).toBe(0)
      expect(second.output.totals.unchanged).toBe(1)
      expect(second.output.totals.pruned).toBe(0)
      expect(second.output.totals.failed).toBe(0)
      expect(fs.snapshot().get(written)).toContain(`${language} one`)
      expect(batches).toEqual([2, 0])
    })
  }
})
