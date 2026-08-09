import { describe, expect, it } from 'vitest'

import { dropOurOwnMod, readGeneratedMod, summariseGeneratedMod } from '../src/index.js'
import type { GeneratedMod, ModFolder, ScannedMod } from '../src/index.js'
import { localeFile, stellarisDef } from './fixtures.js'
import { MemoryFs } from './memory-fs.js'

const scannedMod = (over: Partial<ScannedMod> = {}): ScannedMod => ({
  id: 'mymod',
  name: 'My Mod',
  path: 'workshop/mymod',
  localisationFiles: 1,
  sourceFiles: 1,
  sourceKeys: 1,
  otherSpelling: false,
  coveredBy: [],
  missing: {},
  missingKeys: {},
  coveredKeys: {},
  englishKeys: {},
  keptKeys: {},
  shadowedKeys: {},
  missingFiles: 0,
  missingLines: 0,
  errors: [],
  ...over
})

describe('readGeneratedMod', () => {
  it('returns undefined when nothing was generated yet', async () => {
    const fs = new MemoryFs({})
    expect(await readGeneratedMod('generated', stellarisDef, fs)).toBeUndefined()
  })

  it('indexes keys by namespace and language', async () => {
    const fs = new MemoryFs({
      'generated/localisation/russian/mymod_my_mod/a_l_russian.yml': localeFile('russian', [
        ['K', 'значение']
      ])
    })
    const generated = await readGeneratedMod('generated', stellarisDef, fs)
    expect(generated?.byNamespace.get('mymod_my_mod')?.get('ru')?.get('K')?.value).toBe('значение')
  })

  it('records which file a key came from, so a rewrite can be traced', async () => {
    const fs = new MemoryFs({
      'generated/localisation/russian/ns/a_l_russian.yml': localeFile('russian', [['K', 'v']])
    })
    const generated = await readGeneratedMod('generated', stellarisDef, fs)
    expect(generated?.byNamespace.get('ns')?.get('ru')?.get('K')?.file).toBe(
      'generated/localisation/russian/ns/a_l_russian.yml'
    )
  })

  it('files a key sitting straight under the language folder under no namespace', async () => {
    // It was not written by us and belongs to no mod.
    const fs = new MemoryFs({
      'generated/localisation/russian/loose_l_russian.yml': localeFile('russian', [['K', 'v']])
    })
    const generated = await readGeneratedMod('generated', stellarisDef, fs)
    expect(generated?.byNamespace.has('')).toBe(true)
  })

  it('keeps namespaces of different mods apart', async () => {
    const fs = new MemoryFs({
      'generated/localisation/russian/mod_a/a_l_russian.yml': localeFile('russian', [['K', 'a']]),
      'generated/localisation/russian/mod_b/a_l_russian.yml': localeFile('russian', [['K', 'b']])
    })
    const generated = await readGeneratedMod('generated', stellarisDef, fs)
    expect(generated?.byNamespace.get('mod_a')?.get('ru')?.get('K')?.value).toBe('a')
    expect(generated?.byNamespace.get('mod_b')?.get('ru')?.get('K')?.value).toBe('b')
  })
})

describe('dropOurOwnMod', () => {
  const mods: ModFolder[] = [
    { id: 'mymod', path: 'workshop/mymod' },
    { id: 'missing_translations', path: 'workshop/missing_translations' }
  ]

  it('drops a copy of our own output found in the scanned folder', async () => {
    // It carries no source language and repeats other mods keys, so the coverage heuristic
    // would read it as a third-party localisation mod vouching for our own leftovers.
    const result = dropOurOwnMod(mods, 'missing_translations')
    expect(result.mods.map(m => m.id)).toEqual(['mymod'])
    expect(result.selfCopy).toBe('workshop/missing_translations')
  })

  it('matches the folder name case-insensitively', () => {
    expect(dropOurOwnMod(mods, 'Missing_Translations').selfCopy).toBeDefined()
  })

  it('keeps every mod when no generated folder is known', () => {
    expect(dropOurOwnMod(mods).mods).toHaveLength(2)
    expect(dropOurOwnMod(mods).selfCopy).toBeUndefined()
  })

  it('keeps every mod when the copy is not there', () => {
    expect(dropOurOwnMod(mods, 'something_else').mods).toHaveLength(2)
  })
})

const generated = (namespaces: string[]): GeneratedMod => ({
  path: 'generated',
  byNamespace: new Map(
    namespaces.map(ns => [
      ns,
      new Map([['ru' as const, new Map([['K', { value: 'v', file: 'f' }]])]])
    ])
  )
})

describe('summariseGeneratedMod', () => {
  it('derives the translated count from the states of the scanned mods', () => {
    const summary = summariseGeneratedMod(generated(['mymod_my_mod']), [
      scannedMod({ englishKeys: {}, keptKeys: {}, shadowedKeys: {} })
    ])
    expect(summary.translated).toBe(1)
  })

  it('subtracts english, kept and shadowed from the total', () => {
    const mod = scannedMod({ englishKeys: { ru: 1 }, keptKeys: { ru: 1 }, shadowedKeys: { ru: 1 } })
    const summary = summariseGeneratedMod(generated(['mymod_my_mod']), [mod])
    expect(summary.english).toBe(1)
    expect(summary.kept).toBe(1)
    expect(summary.shadowed).toBe(1)
    expect(summary.translated).toBe(1 - 3)
  })

  it('flags a namespace matching no scanned mod as an orphan', () => {
    // The mod was renamed or unsubscribed, so those files shadow nothing useful.
    const summary = summariseGeneratedMod(generated(['mymod_my_mod', 'gone_forever']), [
      scannedMod()
    ])
    expect(summary.orphanNamespaces).toEqual(['gone_forever'])
    // And an orphan's keys are not counted as a contribution.
    expect(summary.translated).toBe(1)
  })

  it('never treats the no-namespace bucket as an orphan', () => {
    const summary = summariseGeneratedMod(generated(['']), [scannedMod()])
    expect(summary.orphanNamespaces).toEqual([])
  })
})
