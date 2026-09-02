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

function modWithRussian(russian: string): MemoryFs {
  return new MemoryFs({
    'workshop/mymod/descriptor.mod': 'name="My Mod"',
    'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [
      ['K1', 'one'],
      ['K2', 'two']
    ]),
    'workshop/mymod/localisation/a_l_russian.yml': russian
  })
}

function collidingMod(): MemoryFs {
  return modWithRussian(localeFile('russian', [['K1', 'один']]))
}

const UNPARSABLE_RUSSIAN = 'my translation notes, half a file\nK1 = один\n'

const HEADER_ONLY_RUSSIAN = localeFile('russian')

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
    const fs = sourceMod([['K', 'text']])
    const stale =
      'documents/mod/missing_translations/localisation/russian/mymod_my_mod/old_l_russian.yml'
    fs.seedFile(stale, localeFile('russian', [['OLD', 'старое']]))
    const original = fs.readdir.bind(fs)
    fs.readdir = async path => {
      if (path === 'workshop/mymod/localisation/broken') throw new Error('EACCES')
      return original(path)
    }
    fs.seedFile('workshop/mymod/localisation/broken/b_l_english.yml', localeFile('english'))

    const plan = await planFor(fs)
    expect(plan.errors).toHaveLength(1)
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

  it('prunes a mod whose only problem is a line the game skips too', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/descriptor.mod': 'name="My Mod"',
      'workshop/mymod/localisation/english/a_l_english.yml': `${localeFile('english', [
        ['K', 'text']
      ])}40kmega_hive_planet\n`
    })
    const stale =
      'documents/mod/missing_translations/localisation/russian/mymod_my_mod/old_l_russian.yml'
    fs.seedFile(stale, localeFile('russian', [['OLD', 'старое']]))

    const plan = await planFor(fs)
    expect(plan.errors).toEqual([])
    expect(plan.warnings).toHaveLength(1)
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
    expect(result.failedCount).toBe(0)
    expect(result.warnings).toEqual(plan.warnings)
    expect(result.prunedCount).toBe(1)
    expect(fs.snapshot().has(stale)).toBe(false)
  })

  it('still refuses to prune when one warning sits next to one error', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/descriptor.mod': 'name="My Mod"',
      'workshop/mymod/localisation/english/a_l_english.yml': `${localeFile('english', [
        ['K', 'text']
      ])}40kmega_hive_planet\n`,
      'workshop/mymod/localisation/other_l_klingon.yml': localeFile('klingon', [['X', 'tlh']])
    })
    const stale =
      'documents/mod/missing_translations/localisation/russian/mymod_my_mod/old_l_russian.yml'
    fs.seedFile(stale, localeFile('russian', [['OLD', 'старое']]))

    const plan = await planFor(fs)
    expect(plan.warnings).toHaveLength(1)
    expect(plan.errors).toHaveLength(1)
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

describe('applyModJobs - target content', () => {
  const inPlace: Destination = { kind: 'in-place' }
  const mod = { id: 'mymod', path: 'workshop/mymod' }
  const natural = 'workshop/mymod/localisation/a_l_russian.yml'

  it('writes beside an existing translation under missing-keys', async () => {
    const fs = collidingMod()
    const plan = await planFor(fs, { packed: false })
    const result = await applyModJobs(
      {
        plan,
        mod,
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: inPlace
      },
      fs
    )
    expect(result.created.ru?.[0]).toContain('_ptt_missing')
    expect(fs.snapshot().get(natural)).toContain('один')
  })

  it('takes the natural name under complete-file and keeps what that file held', async () => {
    const fs = collidingMod()
    const plan = await planFor(fs, { packed: false, targetContent: 'complete-file' })
    const result = await applyModJobs(
      {
        plan,
        mod,
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: inPlace
      },
      fs
    )
    expect(result.created.ru).toEqual([natural])
    expect(result.skippedCount).toBe(0)
    const written = fs.snapshot().get(natural)
    expect(written).toContain('K2')
    expect(written).toContain('один')
  })

  it('takes the natural name under regenerate-file and discards what that file held', async () => {
    const fs = collidingMod()
    const plan = await planFor(fs, { packed: false, targetContent: 'regenerate-file' })
    const result = await applyModJobs(
      {
        plan,
        mod,
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: inPlace
      },
      fs
    )
    expect(result.created.ru).toEqual([natural])
    const written = fs.snapshot().get(natural)
    expect(written).toContain('K1')
    expect(written).toContain('K2')
    expect(written).not.toContain('один')
  })

  it('copies the file it replaces to .bak before taking its name', async () => {
    for (const targetContent of ['complete-file', 'regenerate-file'] as const) {
      const fs = collidingMod()
      const plan = await planFor(fs, { packed: false, targetContent })
      await applyModJobs(
        {
          plan,
          mod,
          gameDef: stellarisDef,
          sourceLanguage: 'en',
          targetLanguages: ['ru'],
          destination: inPlace
        },
        fs
      )
      expect(fs.snapshot().get(`${natural}.bak`)).toContain('один')
    }
  })

  it('writes no .bak when no file was replaced', async () => {
    const beside = collidingMod()
    await applyModJobs(
      {
        plan: await planFor(beside, { packed: false }),
        mod,
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: inPlace
      },
      beside
    )
    expect([...beside.snapshot().keys()].some(path => path.endsWith('.bak'))).toBe(false)

    const fresh = sourceMod([['K', 'text']])
    await applyModJobs(
      {
        plan: await planFor(fresh, { packed: false, targetContent: 'complete-file' }),
        mod,
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: inPlace
      },
      fresh
    )
    expect([...fresh.snapshot().keys()].some(path => path.endsWith('.bak'))).toBe(false)
  })

  it('backs up a target the parser could not read a single key out of', async () => {
    for (const existing of [UNPARSABLE_RUSSIAN, HEADER_ONLY_RUSSIAN]) {
      for (const targetContent of ['complete-file', 'regenerate-file'] as const) {
        const fs = modWithRussian(existing)
        const result = await applyModJobs(
          {
            plan: await planFor(fs, { packed: false, targetContent }),
            mod,
            gameDef: stellarisDef,
            sourceLanguage: 'en',
            targetLanguages: ['ru'],
            destination: inPlace
          },
          fs
        )
        expect(result.createdCount).toBe(1)
        expect(fs.snapshot().get(`${natural}.bak`)).toBe(existing)
        expect(fs.snapshot().get(natural)).toContain('K2')
      }
    }
  })

  it('still writes no .bak for those same files under missing-keys', async () => {
    for (const existing of [UNPARSABLE_RUSSIAN, HEADER_ONLY_RUSSIAN]) {
      const fs = modWithRussian(existing)
      const result = await applyModJobs(
        {
          plan: await planFor(fs, { packed: false }),
          mod,
          gameDef: stellarisDef,
          sourceLanguage: 'en',
          targetLanguages: ['ru'],
          destination: inPlace
        },
        fs
      )
      expect(result.skippedCount).toBe(1)
      expect(result.createdCount).toBe(0)
      expect([...fs.snapshot().keys()].some(path => path.endsWith('.bak'))).toBe(false)
      expect(fs.snapshot().get(natural)).toBe(existing)
    }
  })

  it('reports a backup it could not take without holding the write back', async () => {
    const fs = collidingMod()
    const plan = await planFor(fs, { packed: false, targetContent: 'complete-file' })
    fs.copyFile = async () => {
      throw new Error('EACCES')
    }
    const result = await applyModJobs(
      {
        plan,
        mod,
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: inPlace
      },
      fs
    )
    expect(result.createdCount).toBe(1)
    expect(result.failedCount).toBe(0)
    expect(result.errors.some(error => error.includes('.bak : ') && error.includes('EACCES'))).toBe(
      true
    )
    expect(fs.snapshot().get(natural)).toContain('K2')
  })

  it('leaves the original in place when the replacement fails', async () => {
    const fs = collidingMod()
    const plan = await planFor(fs, { packed: false, targetContent: 'regenerate-file' })
    const rename = fs.rename.bind(fs)
    fs.rename = async (from, to) => {
      if (to.includes('a_l_russian')) throw new Error('EPERM')
      return rename(from, to)
    }
    const result = await applyModJobs(
      {
        plan,
        mod,
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: inPlace
      },
      fs
    )
    expect(result.failedCount).toBe(1)
    expect(result.createdCount).toBe(0)
    expect(fs.snapshot().get(natural)).toContain('один')
    expect([...fs.snapshot().keys()].some(path => path.endsWith('.tmp'))).toBe(false)
  })

  it('takes the .bak away again when the rename fails', async () => {
    const fs = collidingMod()
    const plan = await planFor(fs, { packed: false, targetContent: 'regenerate-file' })
    const rename = fs.rename.bind(fs)
    fs.rename = async (from, to) => {
      if (to.includes('a_l_russian')) throw new Error('EPERM')
      return rename(from, to)
    }
    const result = await applyModJobs(
      {
        plan,
        mod,
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: inPlace
      },
      fs
    )
    expect(result.failedCount).toBe(1)
    expect([...fs.snapshot().keys()].some(path => path.endsWith('.bak'))).toBe(false)
    expect(fs.snapshot().get(natural)).toContain('один')
  })

  it('rewrites nothing on a second pass over the same plan, under complete-file', async () => {
    const fs = collidingMod()
    const plan = await planFor(fs, { packed: false, targetContent: 'complete-file' })
    const apply = async (): Promise<Awaited<ReturnType<typeof applyModJobs>>> =>
      applyModJobs(
        {
          plan,
          mod,
          gameDef: stellarisDef,
          sourceLanguage: 'en',
          targetLanguages: ['ru'],
          destination: inPlace
        },
        fs
      )
    expect((await apply()).createdCount).toBe(1)
    const second = await apply()
    expect(second.createdCount).toBe(0)
    expect(second.unchangedCount).toBe(1)
  })
})

describe('applyModJobs - write guards', () => {
  const mod = { id: 'mymod', path: 'workshop/mymod' }
  const inPlace: Destination = { kind: 'in-place' }

  it('refuses a target that escapes the folder the mode owns', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [['K', 'text']])
    })
    const plan = await planFor(fs, { packed: false })
    const job = plan.jobs.ru?.[0]
    if (job) job.target = 'workshop/elsewhere/a_l_russian.yml'

    const result = await applyModJobs(
      {
        plan,
        mod,
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: inPlace
      },
      fs
    )
    expect(result.failedCount).toBe(1)
    expect(result.errors.some(error => error.includes('Refusing to write outside'))).toBe(true)
    expect(fs.snapshot().has('workshop/elsewhere/a_l_russian.yml')).toBe(false)
  })

  it('refuses a target that escapes the folder the mode owns under complete-file too', async () => {
    const fs = collidingMod()
    const plan = await planFor(fs, { packed: false, targetContent: 'complete-file' })
    const job = plan.jobs.ru?.[0]
    if (job) job.target = 'workshop/elsewhere/a_l_russian.yml'

    const result = await applyModJobs(
      {
        plan,
        mod,
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: inPlace
      },
      fs
    )
    expect(result.failedCount).toBe(1)
    expect(result.errors.some(error => error.includes('Refusing to write outside'))).toBe(true)
    expect(fs.snapshot().has('workshop/elsewhere/a_l_russian.yml')).toBe(false)
  })

  it('refuses a source file too large to be a localisation file', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [['K', 'text']])
    })
    const plan = await planFor(fs, { packed: false })
    const realStat = fs.stat.bind(fs)
    fs.stat = async path =>
      path.endsWith('a_l_english.yml')
        ? { isDirectory: false, isFile: true, size: 60 * 1024 * 1024 }
        : realStat(path)

    const result = await applyModJobs(
      {
        plan,
        mod,
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        destination: inPlace
      },
      fs
    )
    expect(result.failedCount).toBe(1)
    expect(result.errors.some(error => error.includes('exceeds'))).toBe(true)
  })
})
