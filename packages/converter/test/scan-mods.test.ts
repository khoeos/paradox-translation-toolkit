import { describe, expect, it } from 'vitest'

import { scanMod, scanMods } from '../src/index.js'
import type { ScanModsOptions } from '../src/index.js'
import { localeFile, stellarisDef } from './fixtures.js'
import { MemoryFs } from './memory-fs.js'

const base = (over: Partial<ScanModsOptions> = {}): ScanModsOptions => ({
  rootDir: 'workshop',
  gameDef: stellarisDef,
  sourceLanguage: 'en',
  targetLanguages: ['ru'],
  ...over
})

describe('scanMod', () => {
  it('states zero for a requested language rather than leaving it out', async () => {
    // "Nothing missing" has to be stated, not implied by an absent key.
    const fs = new MemoryFs({
      'mymod/localisation/a_l_english.yml': localeFile('english', [['K', 'A']]),
      'mymod/localisation/a_l_russian.yml': localeFile('russian', [['K', 'А']])
    })
    const { scanned } = await scanMod(
      { id: 'mymod', path: 'mymod' },
      {
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru', 'fr'],
        packed: false
      },
      fs
    )
    expect(scanned.missing.ru).toBe(0)
    expect(scanned.missing.fr).toBe(1)
  })

  it('does not report a file as missing when every key is carried over', async () => {
    // It is rewritten unchanged, so it is no work.
    const fs = new MemoryFs({
      'mymod/localisation/a_l_english.yml': localeFile('english', [['K', 'text']]),
      'generated/localisation/russian/mymod/a_l_russian.yml': localeFile('russian', [
        ['K', 'текст']
      ])
    })
    const { readGeneratedMod } = await import('../src/index.js')
    const generated = await readGeneratedMod('generated', stellarisDef, fs)
    const { scanned } = await scanMod(
      { id: 'mymod', path: 'mymod' },
      {
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        packed: false,
        ...(generated !== undefined && { generated })
      },
      fs
    )
    expect(scanned.missingFiles).toBe(0)
    expect(scanned.missingKeys.ru).toBe(0)
  })

  it('estimates the workload only when asked', async () => {
    const fs = new MemoryFs({
      'mymod/localisation/a_l_english.yml': localeFile('english', [['K', 'real text here']])
    })
    const options = {
      gameDef: stellarisDef,
      sourceLanguage: 'en' as const,
      targetLanguages: ['ru' as const],
      packed: false
    }
    const mod = { id: 'mymod', path: 'mymod' }
    expect((await scanMod(mod, options, fs)).scanned.missingLines).toBe(0)
    expect((await scanMod(mod, options, fs, true)).scanned.missingLines).toBe(1)
  })
})

describe('scanMods', () => {
  const collection = {
    'workshop/a/descriptor.mod': 'name="Mod A"',
    'workshop/a/localisation/english/a_l_english.yml': localeFile('english', [
      ['K1', 'one'],
      ['K2', 'two']
    ]),
    'workshop/b/descriptor.mod': 'name="Mod B"',
    'workshop/b/localisation/english/b_l_english.yml': localeFile('english', [['K3', 'three']]),
    'workshop/b/localisation/russian/b_l_russian.yml': localeFile('russian', [['K3', 'три']])
  }

  it('scans every mod of the collection', async () => {
    const fs = new MemoryFs(collection)
    const output = await scanMods(base(), fs)
    expect(output.mods).toHaveLength(2)
    expect(output.totals.mods).toBe(2)
  })

  it('sorts mods needing work first, then by name', async () => {
    const fs = new MemoryFs(collection)
    const output = await scanMods(base(), fs)
    expect(output.mods.map(m => m.name)).toEqual(['Mod A', 'Mod B'])
    expect(output.mods[0]?.missingFiles).toBe(1)
    expect(output.mods[1]?.missingFiles).toBe(0)
  })

  it('sums the per-language counters into the totals', async () => {
    const fs = new MemoryFs(collection)
    const output = await scanMods(base(), fs)
    expect(output.totals.missingFiles).toBe(1)
    // Mod B already covers its own key.
    expect(output.totals.coveredKeys).toBe(1)
  })

  it('counts mods holding no localisation for this game', async () => {
    const fs = new MemoryFs({ ...collection, 'workshop/c/gfx/icon.dds': 'x' })
    const output = await scanMods(base(), fs)
    expect(output.totals.withoutLocalisation).toBe(1)
  })

  it('counts mods using the other spelling', async () => {
    const fs = new MemoryFs({
      ...collection,
      'workshop/ck3mod/localization/english/a_l_english.yml': localeFile('english', [['K', 'A']])
    })
    const output = await scanMods(base(), fs)
    expect(output.totals.otherSpelling).toBe(1)
  })

  it('applies the coverage of an untracked localisation mod', async () => {
    // The whole point of the key-level diff: Mod A needs nothing once its RU patch is seen.
    const fs = new MemoryFs({
      'workshop/a/descriptor.mod': 'name="Mod A"',
      'workshop/a/localisation/english/a_l_english.yml': localeFile('english', [
        ['K1', 'one'],
        ['K2', 'two']
      ]),
      'workshop/a-ru/descriptor.mod': 'name="Mod A RU"',
      'workshop/a-ru/localisation/russian/a_l_russian.yml': localeFile('russian', [
        ['K1', 'один'],
        ['K2', 'два']
      ])
    })
    const output = await scanMods(base(), fs)
    const modA = output.mods.find(m => m.id === 'a')
    expect(modA?.missingFiles).toBe(0)
    expect(modA?.coveredBy).toEqual(['Mod A RU'])
  })

  it('drops a copy of our own generated mod from the scan', async () => {
    const fs = new MemoryFs({
      ...collection,
      'workshop/missing_translations/localisation/russian/a/a_l_russian.yml': localeFile(
        'russian',
        [['K1', 'один']]
      )
    })
    const output = await scanMods(base({ generatedModFolder: 'missing_translations' }), fs)
    expect(output.selfCopy).toBe('workshop/missing_translations')
    expect(output.mods.map(m => m.id)).not.toContain('missing_translations')
  })

  it('reads back the generated mod and summarises it', async () => {
    const fs = new MemoryFs({
      ...collection,
      'generated/localisation/russian/a_mod_a/a_l_russian.yml': localeFile('russian', [
        ['K1', 'один']
      ])
    })
    const output = await scanMods(base({ generatedModPath: 'generated' }), fs)
    expect(output.generatedMod?.path).toBe('generated')
    expect(output.generatedMod?.translated).toBe(1)
    const modA = output.mods.find(m => m.id === 'a')
    // K1 is carried over, only K2 is left.
    expect(modA?.missingKeys.ru).toBe(1)
  })

  it('reports progress once per mod', async () => {
    const fs = new MemoryFs(collection)
    const seen: Array<[number, number]> = []
    await scanMods(base({ onProgress: (done, total) => seen.push([done, total]) }), fs)
    expect(seen).toEqual([
      [1, 2],
      [2, 2]
    ])
  })

  it('returns the key states only when detail is asked for', async () => {
    const fs = new MemoryFs(collection)
    expect((await scanMods(base(), fs)).keyStates).toBeUndefined()
    const detailed = await scanMods(base({ detail: true }), fs)
    expect(detailed.keyStates?.length).toBeGreaterThan(0)
  })

  it('stops before scanning when cancellation is already requested', async () => {
    // The scan is interruptible, unlike the original where Cancel was a no-op during it.
    const fs = new MemoryFs(collection)
    const output = await scanMods(base({ isCancelled: () => true }), fs)
    expect(output.mods).toEqual([])
    expect(output.totals.mods).toBe(0)
  })

  it('stops taking new mods once cancellation is requested', async () => {
    // Cancel means "stop before the next unit of work", so a collection larger than the pool
    // stops short. Everything already started still finishes: no half-written file.
    const many: Record<string, string> = {}
    for (let i = 0; i < 40; i++) {
      many[`workshop/m${i}/localisation/a_l_english.yml`] = localeFile('english', [['K', 'A']])
    }
    const fs = new MemoryFs(many)
    let cancelled = false
    const output = await scanMods(
      base({
        isCancelled: () => cancelled,
        onProgress: () => {
          cancelled = true
        }
      }),
      fs
    )
    expect(output.mods.length).toBeGreaterThan(0)
    expect(output.mods.length).toBeLessThan(40)
  })

  it('scans a single mod folder as a collection of one', async () => {
    const fs = new MemoryFs({
      'mymod/descriptor.mod': 'name="Solo"',
      'mymod/localisation/english/a_l_english.yml': localeFile('english', [['K', 'A']])
    })
    const output = await scanMods(base({ rootDir: 'mymod' }), fs)
    expect(output.mods).toHaveLength(1)
    expect(output.mods[0]?.name).toBe('Solo')
  })
})
