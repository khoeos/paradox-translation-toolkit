import { describe, expect, it } from 'vitest'

import { SCAN_DIAGNOSTICS_PER_MOD, SCAN_PHASES, scanMod, scanMods } from '../src/index.js'
import type { ScanModsOptions, ScanPhase, ScanRunningTotals } from '../src/index.js'
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
    const fs = new MemoryFs(collection)
    const output = await scanMods(base({ isCancelled: () => true }), fs)
    expect(output.mods).toEqual([])
    expect(output.totals.mods).toBe(0)
  })

  it('stops taking new mods once cancellation is requested', async () => {
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

  it('reports every phase, in order, once', async () => {
    const fs = new MemoryFs(collection)
    const seen: ScanPhase[] = []
    await scanMods(
      base({
        onPhase: phase => {
          if (seen.at(-1) !== phase) seen.push(phase)
        }
      }),
      fs
    )
    expect(seen).toEqual([...SCAN_PHASES])
  })

  it('counts the mods of the two phases that can be counted', async () => {
    const fs = new MemoryFs(collection)
    const counted: Array<[ScanPhase, number, number]> = []
    await scanMods(
      base({
        onPhase: (phase, done, total) => {
          if (done !== undefined && total !== undefined) counted.push([phase, done, total])
        }
      }),
      fs
    )
    expect(counted).toEqual([
      ['building-coverage', 0, 2],
      ['building-coverage', 1, 2],
      ['building-coverage', 2, 2],
      ['planning', 0, 2],
      ['planning', 1, 2],
      ['planning', 2, 2]
    ])
  })

  it('ends its running totals on exactly the totals it returns', async () => {
    const fs = new MemoryFs({
      ...collection,
      'workshop/c/gfx/icon.dds': 'x',
      'workshop/ck3mod/localization/english/a_l_english.yml': localeFile('english', [['K', 'A']]),
      'workshop/broken/localisation/english/b_l_english.yml': `${localeFile('english', [
        ['K4', 'four']
      ])} BAD "no colon"\n`,
      'workshop/alien/localisation/c_l_klingon.yml': localeFile('klingon', [['K5', 'tlh']])
    })
    let last: ScanRunningTotals | undefined
    const output = await scanMods(
      base({
        countLines: true,
        onProgress: (_done, _total, _modName, totals) => {
          last = totals
        }
      }),
      fs
    )
    expect(last).toEqual({
      files: output.mods.reduce((sum, mod) => sum + mod.localisationFiles, 0),
      missingFiles: output.totals.missingFiles,
      missingLines: output.totals.missingLines,
      withoutLocalisation: output.totals.withoutLocalisation,
      otherSpelling: output.totals.otherSpelling,
      errors: output.mods.reduce((sum, mod) => sum + mod.errors.length, 0),
      warnings: output.mods.reduce((sum, mod) => sum + (mod.warnings?.length ?? 0), 0)
    })
    expect(last?.errors).toBeGreaterThan(0)
    expect(last?.warnings).toBeGreaterThan(0)
  })

  it('hands out a snapshot of the running totals rather than the accumulator', async () => {
    const fs = new MemoryFs(collection)
    const seen: ScanRunningTotals[] = []
    await scanMods(base({ onProgress: (_done, _total, _modName, totals) => seen.push(totals) }), fs)
    expect(seen).toHaveLength(2)
    expect(seen[0]).not.toEqual(seen[1])
  })

  it('names the mod and the parser line in a diagnostic', async () => {
    const fs = new MemoryFs({
      'workshop/a/descriptor.mod': 'name="Mod A"',
      'workshop/a/localisation/english/a_l_english.yml': `${localeFile('english', [
        ['K1', 'one']
      ])} BAD "no colon"\n`
    })
    const seen: string[] = []
    await scanMods(base({ onDiagnostic: message => seen.push(message) }), fs)
    expect(seen).toHaveLength(1)
    expect(seen[0]).toContain('Mod A')
    expect(seen[0]).toContain('workshop/a/localisation/english/a_l_english.yml:3')
  })

  it('says whether a diagnostic cost keys or only a line', async () => {
    const fs = new MemoryFs({
      'workshop/a/descriptor.mod': 'name="Mod A"',
      'workshop/a/localisation/english/a_l_english.yml': `${localeFile('english', [
        ['K1', 'one']
      ])} BAD "no colon"\n`,
      'workshop/b/descriptor.mod': 'name="Mod B"',
      'workshop/b/localisation/b_l_klingon.yml': localeFile('klingon', [['K2', 'tlh']])
    })
    const seen: Array<[string, string]> = []
    await scanMods(
      base({ onDiagnostic: (message, severity) => seen.push([message, severity]) }),
      fs
    )
    expect(seen).toContainEqual([
      'Mod A : workshop/a/localisation/english/a_l_english.yml:3 : Dangling line: no `:` and no value, line skipped (the game skips it too)',
      'warning'
    ])
    expect(seen.find(([message]) => message.includes('klingon'))?.[1]).toBe('error')
  })

  it('shows the errors of a mod before its warnings when it has to cap them', async () => {
    const dangling = Array.from({ length: 8 }, (_line, i) => ` BAD${i} "no colon"`).join('\n')
    const fs = new MemoryFs({
      'workshop/a/descriptor.mod': 'name="Mod A"',
      'workshop/a/localisation/english/a_l_english.yml': `${localeFile('english', [
        ['K1', 'one']
      ])}${dangling}\n`,
      'workshop/a/localisation/english/z_l_klingon.yml': localeFile('klingon', [['K2', 'tlh']])
    })
    const seen: Array<[string, string]> = []
    await scanMods(
      base({ onDiagnostic: (message, severity) => seen.push([message, severity]) }),
      fs
    )
    expect(seen[0]?.[1]).toBe('error')
    expect(seen[0]?.[0]).toContain('klingon')
  })

  it('caps the diagnostics of one mod and says how many it left out', async () => {
    const broken = Array.from({ length: 8 }, (_line, i) => ` BAD${i} "no colon"`).join('\n')
    const fs = new MemoryFs({
      'workshop/a/descriptor.mod': 'name="Mod A"',
      'workshop/a/localisation/english/a_l_english.yml': `${localeFile('english', [
        ['K1', 'one']
      ])}${broken}\n`
    })
    const seen: string[] = []
    await scanMods(base({ onDiagnostic: message => seen.push(message) }), fs)
    expect(seen).toHaveLength(SCAN_DIAGNOSTICS_PER_MOD + 1)
    expect(seen.at(-1)).toBe(
      `Mod A : and ${8 - SCAN_DIAGNOSTICS_PER_MOD} more problem(s) not shown`
    )
  })

  it('says out loud that a mod holds no localisation, and that one uses the other spelling', async () => {
    const fs = new MemoryFs({
      'workshop/c/gfx/icon.dds': 'x',
      'workshop/ck3mod/localization/english/a_l_english.yml': localeFile('english', [['K', 'A']])
    })
    const seen: string[] = []
    await scanMods(base({ onDiagnostic: message => seen.push(message) }), fs)
    expect(seen.some(line => line.startsWith('c : no localisation'))).toBe(true)
    expect(seen.some(line => line.includes('other spelling'))).toBe(true)
  })

  it('stops during the coverage phase, which is the longest one', async () => {
    const many: Record<string, string> = {}
    for (let i = 0; i < 40; i++) {
      many[`workshop/m${i}/localisation/a_l_english.yml`] = localeFile('english', [['K', 'A']])
    }
    const fs = new MemoryFs(many)
    let cancelled = false
    const seen: ScanPhase[] = []
    const output = await scanMods(
      base({
        isCancelled: () => cancelled,
        onPhase: (phase, done) => {
          seen.push(phase)
          if (phase === 'building-coverage' && done !== undefined && done > 0) cancelled = true
        }
      }),
      fs
    )
    expect(output.mods).toEqual([])
    expect(seen).not.toContain('planning')
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
