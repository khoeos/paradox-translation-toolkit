import { describe, expect, it } from 'vitest'

import { applyModJobs, planMod } from '../src/index.js'
import type { Destination, KeyPlanOptions, ModPlan, TranslationMod } from '../src/index.js'
import { localeFile, stellarisDef } from './fixtures.js'
import { MemoryFs } from './memory-fs.js'

const translationMod: TranslationMod = {
  name: 'Missing Translations',
  folder: 'missing_translations',
  path: 'documents/mod/missing_translations',
  supportedVersion: '1.19.0.6'
}

const planOptions = (over: Partial<KeyPlanOptions> = {}): KeyPlanOptions => ({
  gameDef: stellarisDef,
  sourceLanguage: 'en',
  targetLanguages: ['ru'],
  packed: true,
  ...over
})

async function planFor(fs: MemoryFs, over: Partial<KeyPlanOptions> = {}): Promise<ModPlan> {
  return planMod({ id: 'mymod', path: 'workshop/mymod' }, planOptions(over), fs)
}

function sourceMod(entries: Array<[string, string]>): MemoryFs {
  return new MemoryFs({
    'workshop/mymod/descriptor.mod': 'name="My Mod"\nsupported_version="1.19.0.6"',
    'workshop/mymod/localisation/english/a_l_english.yml': localeFile('english', entries)
  })
}

const intoTranslationMod: Destination = { kind: 'translation-mod', mod: translationMod }

describe('applyModJobs - translation mod', () => {
  it('writes into the mod namespace under the target language', async () => {
    const fs = sourceMod([['K', 'text']])
    const plan = await planFor(fs)
    const result = await applyModJobs(
      {
        plan,
        mod: { id: 'mymod', path: 'workshop/mymod' },
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: intoTranslationMod
      },
      fs
    )
    expect(result.createdCount).toBe(1)
    expect(result.created.ru).toEqual([
      'documents/mod/missing_translations/localisation/russian/mymod_my_mod/a_l_russian.yml'
    ])
  })

  it('keeps two mods shipping the same file name apart', async () => {
    // The namespace is what makes that collision impossible.
    const fs = new MemoryFs({
      'workshop/a/localisation/english/common_l_english.yml': localeFile('english', [['K1', 'a']]),
      'workshop/b/localisation/english/common_l_english.yml': localeFile('english', [['K2', 'b']])
    })
    for (const id of ['a', 'b']) {
      const plan = await planMod({ id, path: `workshop/${id}` }, planOptions(), fs)
      await applyModJobs(
        {
          plan,
          mod: { id, path: `workshop/${id}` },
          gameDef: stellarisDef,
          sourceLanguage: 'en',
          targetLanguages: ['ru'],
          destination: intoTranslationMod
        },
        fs
      )
    }
    const written = [...fs.snapshot().keys()].filter(p => p.includes('missing_translations'))
    expect(written).toHaveLength(2)
    expect(written.some(p => p.includes('/a/'))).toBe(true)
    expect(written.some(p => p.includes('/b/'))).toBe(true)
  })

  it('overwrites its own output, so a bad first pass is not permanent', async () => {
    const fs = sourceMod([['K', 'text']])
    const target =
      'documents/mod/missing_translations/localisation/russian/mymod_my_mod/a_l_russian.yml'
    fs.seedFile(target, localeFile('russian', [['K', 'stale english']]))

    const plan = await planFor(fs)
    const result = await applyModJobs(
      {
        plan,
        mod: { id: 'mymod', path: 'workshop/mymod' },
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: intoTranslationMod,
        translations: new Map([['ru', new Map([['text', 'текст']])]])
      },
      fs
    )
    expect(result.createdCount).toBe(1)
    expect(fs.snapshot().get(target)).toContain('текст')
  })

  it('does not rewrite a file that would not change', async () => {
    const fs = sourceMod([['K', 'text']])
    const mod = { id: 'mymod', path: 'workshop/mymod' }
    const first = await applyModJobs(
      {
        plan: await planFor(fs),
        mod,
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: intoTranslationMod
      },
      fs
    )
    expect(first.createdCount).toBe(1)

    const second = await applyModJobs(
      {
        plan: await planFor(fs),
        mod,
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: intoTranslationMod
      },
      fs
    )
    expect(second.createdCount).toBe(0)
    expect(second.unchangedCount).toBe(1)
  })

  it('leaves no temporary file behind', async () => {
    const fs = sourceMod([['K', 'text']])
    await applyModJobs(
      {
        plan: await planFor(fs),
        mod: { id: 'mymod', path: 'workshop/mymod' },
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: intoTranslationMod
      },
      fs
    )
    expect([...fs.snapshot().keys()].some(p => p.endsWith('.tmp'))).toBe(false)
  })
})

describe('applyModJobs - pruning', () => {
  it('removes a generated file nothing needs any more', async () => {
    // The mod now translates K itself, so our old file would shadow that translation.
    const fs = new MemoryFs({
      'workshop/mymod/descriptor.mod': 'name="My Mod"',
      'workshop/mymod/localisation/english/a_l_english.yml': localeFile('english', [['K', 'text']]),
      'workshop/mymod/localisation/russian/a_l_russian.yml': localeFile('russian', [
        ['K', 'текст']
      ]),
      'documents/mod/missing_translations/localisation/russian/mymod_my_mod/a_l_russian.yml':
        localeFile('russian', [['K', 'text']])
    })
    const plan = await planFor(fs)
    const result = await applyModJobs(
      {
        plan,
        mod: { id: 'mymod', path: 'workshop/mymod' },
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: intoTranslationMod
      },
      fs
    )
    expect(result.prunedCount).toBe(1)
    expect(
      fs
        .snapshot()
        .has('documents/mod/missing_translations/localisation/russian/mymod_my_mod/a_l_russian.yml')
    ).toBe(false)
  })

  it('never prunes a mod that could not be read', async () => {
    // An unreadable folder plans no job, and taking that for "nothing is missing any more"
    // would delete a good translation.
    const fs = sourceMod([['K', 'text']])
    const stale =
      'documents/mod/missing_translations/localisation/russian/mymod_my_mod/old_l_russian.yml'
    fs.seedFile(stale, localeFile('russian', [['OLD', 'старое']]))

    const plan = await planFor(fs)
    plan.errors.push('workshop/mymod/localisation/broken : EACCES')
    const result = await applyModJobs(
      {
        plan,
        mod: { id: 'mymod', path: 'workshop/mymod' },
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: intoTranslationMod
      },
      fs
    )
    expect(result.prunedCount).toBe(0)
    expect(fs.snapshot().has(stale)).toBe(true)
  })

  it('never prunes a mod declaring no source key', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/russian/a_l_russian.yml': localeFile('russian', [['K', 'текст']])
    })
    const stale = 'documents/mod/missing_translations/localisation/russian/mymod/old_l_russian.yml'
    fs.seedFile(stale, localeFile('russian', [['OLD', 'старое']]))
    const plan = await planFor(fs)
    const result = await applyModJobs(
      {
        plan,
        mod: { id: 'mymod', path: 'workshop/mymod' },
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: intoTranslationMod
      },
      fs
    )
    expect(result.prunedCount).toBe(0)
    expect(fs.snapshot().has(stale)).toBe(true)
  })

  it('never prunes when the run was cancelled', async () => {
    const fs = sourceMod([['K', 'text']])
    const stale =
      'documents/mod/missing_translations/localisation/russian/mymod_my_mod/old_l_russian.yml'
    fs.seedFile(stale, localeFile('russian', [['OLD', 'старое']]))
    const result = await applyModJobs(
      {
        plan: await planFor(fs),
        mod: { id: 'mymod', path: 'workshop/mymod' },
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: intoTranslationMod,
        isCancelled: () => true
      },
      fs
    )
    expect(result.prunedCount).toBe(0)
    expect(fs.snapshot().has(stale)).toBe(true)
  })

  it('leaves another mod namespace alone', async () => {
    const fs = sourceMod([['K', 'text']])
    const other =
      'documents/mod/missing_translations/localisation/russian/other_mod/x_l_russian.yml'
    fs.seedFile(other, localeFile('russian', [['X', 'икс']]))
    await applyModJobs(
      {
        plan: await planFor(fs),
        mod: { id: 'mymod', path: 'workshop/mymod' },
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: intoTranslationMod
      },
      fs
    )
    expect(fs.snapshot().has(other)).toBe(true)
  })
})

describe('applyModJobs - in place and output folder', () => {
  it('writes beside the source files in place', async () => {
    const fs = sourceMod([['K', 'text']])
    const result = await applyModJobs(
      {
        plan: await planFor(fs, { packed: false }),
        mod: { id: 'mymod', path: 'workshop/mymod' },
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: { kind: 'in-place' }
      },
      fs
    )
    expect(result.created.ru).toEqual(['workshop/mymod/localisation/russian/a_l_russian.yml'])
  })

  it('never overwrites an existing file in place', async () => {
    // Somebody else's translation, even outside the scanned folder.
    const fs = sourceMod([['K', 'text']])
    const target = 'workshop/mymod/localisation/russian/a_l_russian.yml'
    fs.seedFile(target, 'their work')
    const result = await applyModJobs(
      {
        plan: await planFor(fs, { packed: false }),
        mod: { id: 'mymod', path: 'workshop/mymod' },
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: { kind: 'in-place' }
      },
      fs
    )
    expect(result.skippedCount).toBe(1)
    expect(result.createdCount).toBe(0)
    expect(fs.snapshot().get(target)).toBe('their work')
  })

  it('mirrors the mod layout under the output folder, one subfolder per mod', async () => {
    const fs = sourceMod([['K', 'text']])
    const result = await applyModJobs(
      {
        plan: await planFor(fs, { packed: false }),
        mod: { id: 'mymod', path: 'workshop/mymod' },
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: { kind: 'output-dir', outputDir: 'out' }
      },
      fs
    )
    expect(result.created.ru).toEqual(['out/mymod_my_mod/localisation/russian/a_l_russian.yml'])
  })
})

describe('applyModJobs - failures', () => {
  it('records a write failure and keeps going', async () => {
    const fs = sourceMod([['K', 'text']])
    const original = fs.writeFile.bind(fs)
    fs.writeFile = async (path, data, encoding) => {
      if (path.includes('a_l_russian')) throw new Error('ENOSPC')
      return original(path, data, encoding)
    }
    const result = await applyModJobs(
      {
        plan: await planFor(fs),
        mod: { id: 'mymod', path: 'workshop/mymod' },
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: intoTranslationMod
      },
      fs
    )
    expect(result.failedCount).toBe(1)
    expect(result.errors.some(e => e.includes('ENOSPC'))).toBe(true)
  })

  it('carries the plan errors into the result', async () => {
    const fs = sourceMod([['K', 'text']])
    const plan = await planFor(fs)
    plan.errors.push('some read error')
    const result = await applyModJobs(
      {
        plan,
        mod: { id: 'mymod', path: 'workshop/mymod' },
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: intoTranslationMod
      },
      fs
    )
    expect(result.errors).toContain('some read error')
  })

  it('reports the descriptor name and version for the generated mod', async () => {
    const fs = sourceMod([['K', 'text']])
    const result = await applyModJobs(
      {
        plan: await planFor(fs),
        mod: { id: 'mymod', path: 'workshop/mymod' },
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: intoTranslationMod
      },
      fs
    )
    expect(result.name).toBe('My Mod')
    expect(result.supportedVersion).toBe('1.19.0.6')
  })

  it('calls back for each file it wrote', async () => {
    const fs = sourceMod([['K', 'text']])
    const seen: string[] = []
    await applyModJobs(
      {
        plan: await planFor(fs),
        mod: { id: 'mymod', path: 'workshop/mymod' },
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: intoTranslationMod,
        onFileWritten: path => seen.push(path)
      },
      fs
    )
    expect(seen).toHaveLength(1)
  })
})
