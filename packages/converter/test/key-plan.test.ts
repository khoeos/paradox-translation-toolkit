import { describe, expect, it } from 'vitest'

import { TARGET_CONTENTS } from '@ptt/shared'

import {
  canPrune,
  PARTIAL_SUFFIX,
  countTranslatableLines,
  getTranslationModPath,
  isUntranslated,
  pendingCount,
  pendingValues,
  planMod,
  readGeneratedMod
} from '../src/index.js'
import type {
  Coverage,
  KeyPlanOptions,
  KeyState,
  ModFolder,
  TranslationMemoryPort
} from '../src/index.js'
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
      'workshop/mymod/localisation/russian/a_l_russian.yml': localeFile('russian', [
        ['K_OWN', 'свой текст']
      ]),
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
    expect([...(job?.known.keys() ?? [])].toSorted()).toEqual(['K_GENERATED', 'K_KEPT'])
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
    const fs = new MemoryFs(files)
    const generated = await readGeneratedMod('generated', stellarisDef, fs)
    const plan = await planMod(mod, options({ detail: true, generated: generated! }), fs)
    expect(stateOf(plan.keyStates, 'K')).toBe('english')
    expect(plan.english.ru).toBe(1)
  })

  it('is kept when the memory proves the backend answered the source text', async () => {
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
    expect(stateOf(plan.keyStates, 'K')).toBe('english')
  })

  it('treats a markup-only value copied verbatim as generated, not as a refusal', async () => {
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
    expect(plan.jobs.ru).toBeUndefined()
  })
})

describe('planMod - target files', () => {
  it('rewrites only the segments below the localisation folder', async () => {
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
    expect(packed.jobs.ru?.[0]?.packed).toEqual(['deep', 'a_l_russian.yml'])
  })

  it('does not collect key states unless detail is asked for', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [['K', 'A']])
    })
    expect((await planMod(mod, options(), fs)).keyStates).toEqual([])
  })
})

describe('planMod - target content', () => {
  const collidingFiles = {
    'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [
      ['K1', 'one'],
      ['K2', 'two']
    ]),
    'workshop/mymod/localisation/a_l_russian.yml': localeFile('russian', [['K1', 'один']])
  }
  const natural = 'workshop/mymod/localisation/a_l_russian.yml'

  it('takes the natural name under complete-file, carrying over what that file holds', async () => {
    const fs = new MemoryFs(collidingFiles)
    const plan = await planMod(mod, options({ targetContent: 'complete-file' }), fs)
    const job = plan.jobs.ru?.[0]
    expect(job?.target).toBe(natural)
    expect([...(job?.keys.keys() ?? [])]).toEqual(['K1', 'K2'])
    expect(Object.fromEntries(job?.known ?? [])).toEqual({ K1: 'один' })
  })

  it('takes the natural name under regenerate-file, carrying nothing over', async () => {
    const fs = new MemoryFs(collidingFiles)
    const plan = await planMod(mod, options({ targetContent: 'regenerate-file' }), fs)
    const job = plan.jobs.ru?.[0]
    expect(job?.target).toBe(natural)
    expect([...(job?.keys.keys() ?? [])]).toEqual(['K1', 'K2'])
    expect(job?.known.size).toBe(0)
  })

  it('sits beside the existing file under missing-keys, and by default', async () => {
    const expected = `workshop/mymod/localisation/a${PARTIAL_SUFFIX}_l_russian.yml`
    for (const over of [{ targetContent: 'missing-keys' } as const, {}]) {
      const fs = new MemoryFs(collidingFiles)
      const plan = await planMod(mod, options(over), fs)
      const job = plan.jobs.ru?.[0]
      expect(job?.target).toBe(expected)
      expect([...(job?.keys.keys() ?? [])]).toEqual(['K2'])
    }
  })

  it('never puts a key a separate localisation mod supplies into a job, in any mode', async () => {
    const files = {
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [
        ['K_OWN', 'one'],
        ['K_PATCH', 'two'],
        ['K_MISSING', 'three']
      ]),
      'workshop/mymod/localisation/a_l_russian.yml': localeFile('russian', [['K_OWN', 'один']])
    }
    const coverage: Coverage = {
      byLanguage: new Map([['ru', new Set(['K_PATCH'])]]),
      sources: ['RU Patch']
    }
    for (const targetContent of TARGET_CONTENTS) {
      const fs = new MemoryFs(files)
      const plan = await planMod(mod, options({ coverage, targetContent }), fs)
      const planned = (plan.jobs.ru ?? []).flatMap(job => Array.from(job.keys.keys()))
      expect(planned).toContain('K_MISSING')
      expect(planned).not.toContain('K_PATCH')
    }
  })

  it('still plans one job per source file under the whole-file modes', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [
        ['A1', 'one'],
        ['A2', 'two']
      ]),
      'workshop/mymod/localisation/b_l_english.yml': localeFile('english', [
        ['B1', 'three'],
        ['B2', 'four']
      ]),
      'workshop/mymod/localisation/a_l_russian.yml': localeFile('russian', [['A1', 'один']]),
      'workshop/mymod/localisation/b_l_russian.yml': localeFile('russian', [['B1', 'три']])
    })
    const plan = await planMod(mod, options({ targetContent: 'complete-file' }), fs)
    expect(plan.jobs.ru).toHaveLength(2)
    const forA = plan.jobs.ru?.find(job => job.source.endsWith('a_l_english.yml'))
    expect(forA?.target).toBe(natural)
    expect([...(forA?.keys.keys() ?? [])]).toEqual(['A1', 'A2'])
  })

  it('emits no job when the target file already holds every key', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english', [
        ['K1', 'one'],
        ['K2', 'two']
      ]),
      'workshop/mymod/localisation/a_l_russian.yml': localeFile('russian', [
        ['K1', 'один'],
        ['K2', 'два']
      ])
    })
    const plan = await planMod(mod, options({ targetContent: 'complete-file' }), fs)
    expect(plan.jobs.ru).toBeUndefined()
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
    expect(countTranslatableLines(plan.jobs)).toBe(2)
  })

  it('is zero when there is nothing planned', () => {
    expect(countTranslatableLines({})).toBe(0)
  })
})

describe('planMod - a value whose quote never closes', () => {
  const runawayValue = `\ufeffl_english:
 K_BEFORE:0 "fine"
 K_OPEN:0 "never closed
 K_AFTER:0 "fine too"
`

  it('blocks the prune instead of only warning', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/english/a_l_english.yml': runawayValue
    })
    const plan = await planMod(mod, options(), fs)
    expect(plan.warnings).toEqual([])
    expect(plan.errors).toHaveLength(1)
    expect(plan.errors[0]).toContain('K_AFTER')
    expect(canPrune(plan, false)).toBe(false)
  })

  it('still reads every key around it', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/english/a_l_english.yml': runawayValue
    })
    const plan = await planMod(mod, options(), fs)
    expect(plan.sourceKeys).toBe(2)
  })
})
