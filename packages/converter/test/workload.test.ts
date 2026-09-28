import { describe, expect, it } from 'vitest'

import type { CreationJob, ModFolder, ModPlan } from '../src/types.js'
import {
  backendValues,
  countTranslationWorkload,
  createWorkloadTracker,
  translatableValues
} from '../src/workload.js'

const job = (
  keys: ReadonlyArray<readonly [string, string]>,
  known: readonly string[] = []
): CreationJob => ({
  source: 'a_l_english.yml',
  target: 'a_l_russian.yml',
  packed: [],
  keys: new Map(keys),
  known: new Map(known.map(key => [key, 'kept'])),
  content: 'missing-keys'
})

const plan = (jobs: ModPlan['jobs']): ModPlan => ({
  name: 'Mod',
  namespace: 'mod',
  otherSpelling: false,
  sourceKeys: 0,
  localisationFiles: 0,
  sourceFiles: 0,
  targetLanguages: Object.keys(jobs),
  jobs,
  covered: {},
  english: {},
  kept: {},
  shadowed: {},
  keyStates: [],
  errors: [],
  warnings: []
})

const mods: ModFolder[] = [
  { id: 'a', path: 'workshop/a' },
  { id: 'b', path: 'workshop/b' }
]

const cache = (cached: readonly string[] = []) => ({
  isCached: (_language: string, value: string): boolean => cached.includes(value)
})

const plans: Record<string, ModPlan> = {
  a: plan({
    ru: [
      job([
        ['K1', 'Colony Ship'],
        ['K2', 'Science Ship']
      ])
    ],
    fr: [job([['K1', 'Colony Ship']])],
    english: [job([['K1', 'Colony Ship']])]
  }),
  b: plan({
    ru: [
      job([
        ['K3', 'Colony Ship'],
        ['K4', 'Star Fortress']
      ])
    ]
  })
}

const count = (cached: readonly string[] = [], isCancelled = (): boolean => false) => {
  const reported: number[] = []
  const result = countTranslationWorkload({
    mods,
    sourceLanguage: 'english',
    engine: cache(cached),
    plan: async mod => plans[mod.id]!,
    isCancelled,
    onMod: done => reported.push(done)
  })
  return { result, reported }
}

describe('translatableValues', () => {
  it('keeps the pending values worth translating, leaving out the known keys', () => {
    expect(
      translatableValues([
        job(
          [
            ['K1', 'Colony Ship'],
            ['K2', 'Kept'],
            ['K3', '']
          ],
          ['K2']
        )
      ])
    ).toEqual(['Colony Ship'])
  })
})

describe('backendValues', () => {
  it('lists the values the cache cannot answer', () => {
    expect(backendValues(new Set(['a', 'b', 'c']), 'ru', cache(['b']))).toEqual(['a', 'c'])
  })
})

describe('countTranslationWorkload', () => {
  it('counts every distinct string once per language, across the mods', async () => {
    const { result } = count()
    const workload = await result
    expect(workload.total).toBe(4)
    expect([...(workload.unclaimed.get('ru') ?? [])].toSorted()).toEqual([
      'Colony Ship',
      'Science Ship',
      'Star Fortress'
    ])
    expect([...(workload.unclaimed.get('fr') ?? [])]).toEqual(['Colony Ship'])
  })

  it('never counts the language the run reads from', async () => {
    const { unclaimed } = await count().result
    expect(unclaimed.has('english')).toBe(false)
  })

  it('leaves out what the cache already answers', async () => {
    const { total } = await count(['Colony Ship']).result
    expect(total).toBe(2)
  })

  it('reports each mod it has counted', async () => {
    const { result, reported } = count()
    await result
    expect(reported).toEqual([0, 1, 2])
  })

  it('stops planning once cancelled', async () => {
    const { result, reported } = count([], () => true)
    expect((await result).total).toBe(0)
    expect(reported).toEqual([0])
  })
})

const unclaimed = (): Map<string, Set<string>> =>
  new Map([['ru', new Set(['Colony Ship', 'Science Ship', 'Star Fortress'])]])

describe('createWorkloadTracker', () => {
  it('credits a shared string to the first mod that sends it, never to the next', () => {
    const tracker = createWorkloadTracker(unclaimed())
    tracker.claim('a::ru', 'ru', ['Colony Ship', 'Science Ship'])
    tracker.claim('b::ru', 'ru', ['Colony Ship', 'Star Fortress'])

    expect(tracker.settle('a::ru', 2)).toBe(2)
    expect(tracker.settle('b::ru', 2)).toBe(3)
  })

  it('follows a mod up and down while it settles, within what it claimed', () => {
    const tracker = createWorkloadTracker(unclaimed())
    tracker.claim('a::ru', 'ru', ['Colony Ship', 'Science Ship'])

    expect(tracker.settle('a::ru', 5)).toBe(2)
    expect(tracker.settle('a::ru', 1)).toBe(1)
    expect(tracker.settle('a::ru', -1)).toBe(0)
  })

  it('credits nothing to a mod whose strings were not counted', () => {
    const tracker = createWorkloadTracker(new Map())
    tracker.claim('a::ru', 'ru', ['Colony Ship'])
    expect(tracker.settle('a::ru', 1)).toBe(0)
  })
})
