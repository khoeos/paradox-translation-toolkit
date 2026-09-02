import { describe, expect, it } from 'vitest'

import { PARTIAL_SUFFIX, runConvert } from '../src/index.js'
import type { ConvertRunOptions, JobEvent, ProgressPort, TranslationMod } from '../src/index.js'
import { localeFile, stellarisGame } from './fixtures.js'
import { MemoryFs } from './memory-fs.js'

const collectingPort = (): { port: ProgressPort; events: JobEvent[] } => {
  const events: JobEvent[] = []
  return { port: { emit: event => events.push(event) }, events }
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
  targetLanguages: ['ru'],
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
