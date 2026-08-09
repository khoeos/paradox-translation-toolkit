import { describe, expect, it } from 'vitest'

import {
  PARTIAL_SUFFIX,
  countTranslatableLines,
  getTranslationModPath,
  isUntranslated,
  pendingCount,
  pendingValues,
  planMod,
  readGeneratedMod
} from '../src/index.js'
import type { KeyPlanOptions, KeyState, ModFolder, TranslationMemoryPort } from '../src/index.js'
import { localeFile, stellarisDef } from './fixtures.js'
import { MemoryFs } from './memory-fs.js'

const mod: ModFolder = { id: 'mymod', path: 'workshop/mymod' }

const options = (extra: Partial<KeyPlanOptions> = {}): KeyPlanOptions => ({
  gameDef: stellarisDef,
  sourceLanguage: 'en',
  targetLanguages: ['ru'],
  packed: false,
  ...extra
})

/** A memory that claims the backend answered `value` with exactly `value`. */
const memoryKeeping = (...values: string[]): TranslationMemoryPort => ({
  get: (_language, value) => (values.includes(value) ? value : undefined)
})

const stateOf = (states: { key: string; state: KeyState }[], key: string): KeyState | undefined =>
  states.find(s => s.key === key)?.state

describe('isUntranslated', () => {
  it('is true when the value was copied verbatim', () => {
    expect(isUntranslated('Colony Ship', 'Colony Ship')).toBe(true)
  })

  it('ignores surrounding whitespace', () => {
    expect(isUntranslated('  Colony Ship ', 'Colony Ship')).toBe(true)
  })

  it('is false for a real translation', () => {
    expect(isUntranslated('Корабль-колония', 'Colony Ship')).toBe(false)
  })
})

describe('planMod - nothing to do', () => {
  it('reports no localisation at all', async () => {
    const fs = new MemoryFs({ 'workshop/mymod/gfx/icon.dds': 'x' })
    const plan = await planMod(mod, options(), fs)
    expect(plan.localisationFiles).toBe(0)
    expect(plan.jobs).toEqual({})
  })

  it('reports a mod with no source language', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/russian/a_l_russian.yml': localeFile('russian', [['K', 'Р']])
    })
    const plan = await planMod(mod, options(), fs)
    expect(plan.localisationFiles).toBe(1)
    expect(plan.sourceKeys).toBe(0)
    expect(plan.jobs).toEqual({})
  })

  it('takes the mod name from the descriptor, falling back to the folder', async () => {
    const withDescriptor = new MemoryFs({
      'workshop/mymod/descriptor.mod': 'name="Real Name"',
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [['K', 'A']])
    })
    expect((await planMod(mod, options(), withDescriptor)).name).toBe('Real Name')

    const without = new MemoryFs({
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [['K', 'A']])
    })
    expect((await planMod(mod, options(), without)).name).toBe('mymod')
  })

  it('skips a target language equal to the source', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [['K', 'A']])
    })
    const plan = await planMod(mod, options({ targetLanguages: ['en'] }), fs)
    expect(plan.jobs).toEqual({})
  })
})

describe('planMod - the six key states', () => {
  const sourceFiles = {
    'workshop/mymod/localisation/english/a_l_english.yml': localeFile('english', [
      ['K_OWN', 'own text'],
      ['K_PATCH', 'patch text'],
      ['K_GENERATED', 'generated text'],
      ['K_ENGLISH', 'english text'],
      ['K_KEPT', 'Colony Ship'],
      ['K_MISSING', 'missing text']
    ])
  }

  async function planWithEverything(): Promise<Awaited<ReturnType<typeof planMod>>> {
    const fs = new MemoryFs({
      ...sourceFiles,
      // The mod translates K_OWN itself.
      'workshop/mymod/localisation/russian/a_l_russian.yml': localeFile('russian', [
        ['K_OWN', 'свой текст']
      ]),
      // A previous run of ours produced these, under the mod namespace.
      'generated/localisation/russian/mymod/a_l_russian.yml': localeFile('russian', [
        ['K_GENERATED', 'сгенерировано'],
        ['K_ENGLISH', 'english text'],
        ['K_KEPT', 'Colony Ship']
      ])
    })
    const generated = await readGeneratedMod('generated', stellarisDef, fs)
    return planMod(
      mod,
      options({
        detail: true,
        coverage: { byLanguage: new Map([['ru', new Set(['K_PATCH'])]]), sources: ['RU Patch'] },
        ...(generated !== undefined && { generated }),
        memory: memoryKeeping('Colony Ship')
      }),
      fs
    )
  }

  it('classifies every key', async () => {
    const plan = await planWithEverything()
    const states = plan.keyStates
    expect(stateOf(states, 'K_OWN')).toBe('own')
    expect(stateOf(states, 'K_PATCH')).toBe('patch')
    expect(stateOf(states, 'K_GENERATED')).toBe('generated')
    expect(stateOf(states, 'K_ENGLISH')).toBe('english')
    expect(stateOf(states, 'K_KEPT')).toBe('kept')
    expect(stateOf(states, 'K_MISSING')).toBe('missing')
  })

  it('counts own and patch as covered, and keeps english out of it', async () => {
    const plan = await planWithEverything()
    // own + patch + generated + kept
    expect(plan.covered.ru).toBe(4)
    expect(plan.english.ru).toBe(1)
    expect(plan.kept.ru).toBe(1)
  })

  it('names who supplies the current value', async () => {
    const plan = await planWithEverything()
    expect(plan.keyStates.find(s => s.key === 'K_PATCH')?.provider).toBe('RU Patch')
    expect(plan.keyStates.find(s => s.key === 'K_GENERATED')?.provider).toContain('a_l_russian.yml')
  })

  it('writes only the keys nobody covers, and carries over what we already did', async () => {
    const plan = await planWithEverything()
    const job = plan.jobs.ru?.[0]
    expect([...(job?.keys.keys() ?? [])].toSorted()).toEqual([
      'K_ENGLISH',
      'K_GENERATED',
      'K_KEPT',
      'K_MISSING'
    ])
    // Carried over rather than sent to a translator again.
    expect([...(job?.known.keys() ?? [])].toSorted()).toEqual(['K_GENERATED', 'K_KEPT'])
    // Only these two still need a translator.
    expect(pendingCount(job!)).toBe(2)
    expect(pendingValues(job!).toSorted()).toEqual(['english text', 'missing text'])
  })
})

describe('planMod - english versus kept', () => {
  const files = {
    'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [['K', 'Colony Ship']]),
    'generated/localisation/russian/mymod/a_l_russian.yml': localeFile('russian', [
      ['K', 'Colony Ship']
    ])
  }

  it('is english when the memory knows nothing about the string', async () => {
    // Nothing ever came back for it, so the next run has to try again.
    const fs = new MemoryFs(files)
    const generated = await readGeneratedMod('generated', stellarisDef, fs)
    const plan = await planMod(mod, options({ detail: true, generated: generated! }), fs)
    expect(stateOf(plan.keyStates, 'K')).toBe('english')
    expect(plan.english.ru).toBe(1)
  })

  it('is kept when the memory proves the backend answered the source text', async () => {
    // A proper name it chose to keep is worth no retry, only the same bill.
    const fs = new MemoryFs(files)
    const generated = await readGeneratedMod('generated', stellarisDef, fs)
    const plan = await planMod(
      mod,
      options({ detail: true, generated: generated!, memory: memoryKeeping('Colony Ship') }),
      fs
    )
    expect(stateOf(plan.keyStates, 'K')).toBe('kept')
    expect(plan.kept.ru).toBe(1)
    expect(plan.english.ru).toBe(0)
  })

  it('is kept when the memory answered something else entirely', async () => {
    const fs = new MemoryFs(files)
    const generated = await readGeneratedMod('generated', stellarisDef, fs)
    const plan = await planMod(
      mod,
      options({
        detail: true,
        generated: generated!,
        memory: { get: () => 'Корабль' }
      }),
      fs
    )
    // The memory disagrees with what is on disk, so what is on disk is a real translation.
    expect(stateOf(plan.keyStates, 'K')).toBe('english')
  })

  it('treats a markup-only value copied verbatim as generated, not as a refusal', async () => {
    // Markup and numbers are copied on purpose and never sent anywhere.
    const fs = new MemoryFs({
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [['K', '$AMOUNT$']]),
      'generated/localisation/russian/mymod/a_l_russian.yml': localeFile('russian', [
        ['K', '$AMOUNT$']
      ])
    })
    const generated = await readGeneratedMod('generated', stellarisDef, fs)
    const plan = await planMod(mod, options({ detail: true, generated: generated! }), fs)
    expect(stateOf(plan.keyStates, 'K')).toBe('generated')
    expect(plan.keyStates[0]?.markupOnly).toBe(true)
  })
})

describe('planMod - shadowing', () => {
  it('flags a key our mod holds although somebody else translates it', async () => {
    // Our mod loads last, so its copy hides their work until the next run drops the key.
    const fs = new MemoryFs({
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [['K', 'text']]),
      'workshop/mymod/localisation/russian/a_l_russian.yml': localeFile('russian', [
        ['K', 'текст']
      ]),
      'generated/localisation/russian/mymod/a_l_russian.yml': localeFile('russian', [
        ['K', 'наш текст']
      ])
    })
    const generated = await readGeneratedMod('generated', stellarisDef, fs)
    const plan = await planMod(mod, options({ detail: true, generated: generated! }), fs)
    expect(plan.shadowed.ru).toBe(1)
    expect(plan.keyStates.find(s => s.key === 'K')?.shadowed).toBe(true)
    // And the key is not written again.
    expect(plan.jobs.ru).toBeUndefined()
  })
})

describe('planMod - target files', () => {
  it('rewrites only the segments below the localisation folder', async () => {
    // A mod folder named after a language must survive untouched.
    const fs = new MemoryFs({
      'workshop/english_names_fix/localisation/english/a_l_english.yml': localeFile('english', [
        ['K', 'A']
      ])
    })
    const plan = await planMod(
      { id: 'english_names_fix', path: 'workshop/english_names_fix' },
      options(),
      fs
    )
    expect(plan.jobs.ru?.[0]?.target).toBe(
      'workshop/english_names_fix/localisation/russian/a_l_russian.yml'
    )
  })

  it('sits beside an existing translation instead of rewriting it', async () => {
    // Flat layout, so the natural target name really is the existing file. Topping it up
    // would mean rewriting somebody else's work.
    const fs = new MemoryFs({
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [
        ['K1', 'one'],
        ['K2', 'two']
      ]),
      'workshop/mymod/localisation/a_l_russian.yml': localeFile('russian', [['K1', 'один']])
    })
    const plan = await planMod(mod, options(), fs)
    const job = plan.jobs.ru?.[0]
    expect(job?.target).toBe(`workshop/mymod/localisation/a${PARTIAL_SUFFIX}_l_russian.yml`)
    // K1 is covered by that existing file, so only K2 goes into the new one.
    expect([...(job?.keys.keys() ?? [])]).toEqual(['K2'])
  })

  it('skips a file whose target path is the file itself', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [['K', 'A']])
    })
    const plan = await planMod(mod, options({ targetLanguages: ['en'] }), fs)
    expect(plan.jobs).toEqual({})
  })

  it('keeps an absolute path absolute', async () => {
    // posixSplit drops empty segments, so the root separator has to survive by hand.
    const fs = new MemoryFs({
      '/abs/mymod/localisation/a_l_english.yml': localeFile('english', [['K', 'A']])
    })
    const plan = await planMod({ id: 'mymod', path: '/abs/mymod' }, options(), fs)
    expect(plan.jobs.ru?.[0]?.target).toBe('/abs/mymod/localisation/a_l_russian.yml')
  })

  it('plans one job per source file', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/english/a_l_english.yml': localeFile('english', [['K1', 'one']]),
      'workshop/mymod/localisation/english/b_l_english.yml': localeFile('english', [['K2', 'two']])
    })
    const plan = await planMod(mod, options(), fs)
    expect(plan.jobs.ru).toHaveLength(2)
  })

  it('plans per target language', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [['K', 'A']])
    })
    const plan = await planMod(mod, options({ targetLanguages: ['ru', 'fr'] }), fs)
    expect(plan.jobs.ru).toHaveLength(1)
    expect(plan.jobs.fr).toHaveLength(1)
  })

  it('ignores a target language the game does not support', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [['K', 'A']])
    })
    // stellarisDef declares no Turkish token.
    const plan = await planMod(mod, options({ targetLanguages: ['tr'] }), fs)
    expect(plan.jobs).toEqual({})
  })

  it('computes the packed path only when asked', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/english/deep/a_l_english.yml': localeFile('english', [
        ['K', 'A']
      ])
    })
    expect((await planMod(mod, options(), fs)).jobs.ru?.[0]?.packed).toEqual([])
    const packed = await planMod(mod, options({ packed: true }), fs)
    // The source language folder is dropped, the rest of the layout is kept.
    expect(packed.jobs.ru?.[0]?.packed).toEqual(['deep', 'a_l_russian.yml'])
  })

  it('does not collect key states unless detail is asked for', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [['K', 'A']])
    })
    expect((await planMod(mod, options(), fs)).keyStates).toEqual([])
  })
})

describe('getTranslationModPath', () => {
  it('drops the source language folder', () => {
    const file = { path: 'x', locIndex: 1, rest: ['english', 'deep', 'a_l_english.yml'] }
    expect(getTranslationModPath(file, 'dir/a_l_russian.yml', 'english')).toEqual([
      'deep',
      'a_l_russian.yml'
    ])
  })

  it('keeps the layout when there is no language folder', () => {
    const file = { path: 'x', locIndex: 1, rest: ['deep', 'a_l_english.yml'] }
    expect(getTranslationModPath(file, 'dir/a_l_russian.yml', 'english')).toEqual([
      'deep',
      'a_l_russian.yml'
    ])
  })

  it('matches the language folder case-insensitively', () => {
    const file = { path: 'x', locIndex: 1, rest: ['English', 'a_l_english.yml'] }
    expect(getTranslationModPath(file, 'a_l_russian.yml', 'english')).toEqual(['a_l_russian.yml'])
  })
})

describe('countTranslatableLines', () => {
  it('counts only the values still needing a translator', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [
        ['K1', 'real text here'],
        ['K2', '$MARKUP$'],
        ['K3', 'more real text']
      ])
    })
    const plan = await planMod(mod, options(), fs)
    // K2 is markup only, so no translator ever sees it.
    expect(countTranslatableLines(plan.jobs)).toBe(2)
  })

  it('is zero when there is nothing planned', () => {
    expect(countTranslatableLines({})).toBe(0)
  })
})
