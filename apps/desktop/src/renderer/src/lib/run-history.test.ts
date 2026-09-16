import { describe, expect, it } from 'vitest'

import type { RunReportSummary } from '@ptt/report'

import {
  buildGameFilterOptions,
  filterRuns,
  getPageCount,
  getPageSlice,
  getRunCreatedDeltas,
  groupRunsByDay,
  RUNS_PER_PAGE,
  sortRuns,
  type RunHistoryLabels,
  type RunHistoryQuery
} from './run-history.js'

const LABELS: RunHistoryLabels = {
  games: { ck3: 'Crusader Kings III', hoi4: 'Hearts of Iron IV' },
  languages: { fr: 'French', de: 'German' },
  modes: { 'create-translation-mod': 'Create translation mod' }
}

const run = (overrides: Partial<RunReportSummary>): RunReportSummary => ({
  file: 'run-1.json',
  jsonPath: '/reports/run-1.json',
  csvPath: '/reports/run-1.csv',
  csvExists: true,
  startedAt: '2026-09-08T19:00:00.000Z',
  finishedAt: '2026-09-08T19:00:10.000Z',
  seconds: 10,
  game: 'ck3',
  mode: 'create-translation-mod',
  targetContent: 'missing-keys',
  sourceLanguage: 'en',
  targetLanguages: ['fr', 'de'],
  selectedMods: 5,
  rootPath: 'C:/mods',
  translationModName: 'My Translations',
  created: 100,
  failed: 0,
  errors: 0,
  skipped: 0,
  pruned: 0,
  mods: 5,
  modsWithFiles: 5,
  modsWithErrors: 0,
  cancelled: false,
  outcome: 'clean',
  ...overrides
})

const BASE_QUERY: RunHistoryQuery = { outcome: 'all', gameId: 'all', search: '' }

describe('filterRuns', () => {
  const clean = run({ file: 'run-clean.json', outcome: 'clean', game: 'ck3' })
  const issues = run({ file: 'run-issues.json', outcome: 'issues', game: 'hoi4' })
  const failed = run({ file: 'run-failed.json', outcome: 'failed', game: 'ck3' })
  const cancelled = run({ file: 'run-cancelled.json', outcome: 'cancelled', game: 'hoi4' })
  const all = [clean, issues, failed, cancelled]

  it('outcome "all" keeps everything', () => {
    expect(filterRuns(all, BASE_QUERY, LABELS)).toHaveLength(4)
  })

  it('outcome "clean" keeps only clean runs', () => {
    const result = filterRuns(all, { ...BASE_QUERY, outcome: 'clean' }, LABELS)
    expect(result).toEqual([clean])
  })

  it('outcome "issues" keeps failed, issues and cancelled runs', () => {
    const result = filterRuns(all, { ...BASE_QUERY, outcome: 'issues' }, LABELS)
    expect(result.map(r => r.file).toSorted()).toEqual(
      ['run-cancelled.json', 'run-failed.json', 'run-issues.json'].toSorted()
    )
  })

  it('gameId filters by game', () => {
    const result = filterRuns(all, { ...BASE_QUERY, gameId: 'hoi4' }, LABELS)
    expect(result.map(r => r.file).toSorted()).toEqual(['run-cancelled.json', 'run-issues.json'])
  })

  it('search matches a translated game label', () => {
    const result = filterRuns(all, { ...BASE_QUERY, search: 'Hearts of Iron' }, LABELS)
    expect(result.map(r => r.file).toSorted()).toEqual(['run-cancelled.json', 'run-issues.json'])
  })

  it('search matches a translated language label', () => {
    const result = filterRuns(
      [run({ file: 'run-lang.json', targetLanguages: ['fr'] })],
      { ...BASE_QUERY, search: 'french' },
      LABELS
    )
    expect(result).toHaveLength(1)
  })

  it('combines outcome, game and search', () => {
    const result = filterRuns(all, { outcome: 'issues', gameId: 'hoi4', search: 'iron' }, LABELS)
    expect(result.map(r => r.file).toSorted()).toEqual(['run-cancelled.json', 'run-issues.json'])
  })

  it('a search matching nothing returns an empty list', () => {
    expect(filterRuns(all, { ...BASE_QUERY, search: 'nonexistent' }, LABELS)).toEqual([])
  })
})

describe('sortRuns', () => {
  const older = run({
    file: 'a.json',
    startedAt: '2026-09-01T10:00:00.000Z',
    created: 10,
    failed: 1,
    errors: 2,
    seconds: 5
  })
  const newer = run({
    file: 'b.json',
    startedAt: '2026-09-05T10:00:00.000Z',
    created: 50,
    failed: 3,
    errors: 1,
    seconds: 20
  })
  const items = [older, newer]

  it('sorts by date descending by default', () => {
    expect(sortRuns(items, 'date').map(r => r.file)).toEqual(['b.json', 'a.json'])
  })

  it('sorts by created descending', () => {
    expect(sortRuns(items, 'created').map(r => r.file)).toEqual(['b.json', 'a.json'])
  })

  it('sorts by failed descending', () => {
    expect(sortRuns(items, 'failed').map(r => r.file)).toEqual(['b.json', 'a.json'])
  })

  it('sorts by errors descending', () => {
    expect(sortRuns(items, 'errors').map(r => r.file)).toEqual(['a.json', 'b.json'])
  })

  it('sorts by seconds descending', () => {
    expect(sortRuns(items, 'seconds').map(r => r.file)).toEqual(['b.json', 'a.json'])
  })

  it('does not mutate the input array', () => {
    const copy = [...items]
    sortRuns(items, 'created')
    expect(items).toEqual(copy)
  })
})

describe('paging', () => {
  const items = Array.from({ length: 23 }, (_, i) => run({ file: `run-${i}.json` }))

  it('getPageCount computes the number of pages', () => {
    expect(getPageCount(23)).toBe(3)
    expect(getPageCount(20)).toBe(2)
    expect(getPageCount(0)).toBe(1)
  })

  it('RUNS_PER_PAGE is 10', () => {
    expect(RUNS_PER_PAGE).toBe(10)
  })

  it('getPageSlice returns a full page', () => {
    expect(getPageSlice(items, 1)).toHaveLength(10)
    expect(getPageSlice(items, 1)[0]?.file).toBe('run-0.json')
  })

  it('getPageSlice returns a partial last page', () => {
    const last = getPageSlice(items, 3)
    expect(last).toHaveLength(3)
    expect(last[0]?.file).toBe('run-20.json')
  })

  it('getPageSlice clamps a page below 1 up to 1', () => {
    expect(getPageSlice(items, 0)[0]?.file).toBe('run-0.json')
    expect(getPageSlice(items, -5)[0]?.file).toBe('run-0.json')
  })

  it('getPageSlice clamps a page beyond the last one down to the last page', () => {
    const clamped = getPageSlice(items, 99)
    expect(clamped).toHaveLength(3)
    expect(clamped[0]?.file).toBe('run-20.json')
  })
})

describe('groupRunsByDay', () => {
  it('groups consecutive runs on the same local day', () => {
    const items = [
      run({ file: 'a.json', startedAt: '2026-09-08T09:00:00.000Z' }),
      run({ file: 'b.json', startedAt: '2026-09-08T08:00:00.000Z' }),
      run({ file: 'c.json', startedAt: '2026-09-07T09:00:00.000Z' })
    ]
    const groups = groupRunsByDay(items)
    expect(groups).toHaveLength(2)
    expect(groups[0]?.items.map(r => r.file)).toEqual(['a.json', 'b.json'])
    expect(groups[1]?.items.map(r => r.file)).toEqual(['c.json'])
  })

  it('returns an empty array for no items', () => {
    expect(groupRunsByDay([])).toEqual([])
  })
})

describe('getRunCreatedDeltas', () => {
  it('has no entry for a run with no predecessor of the same signature', () => {
    const items = [run({ file: 'only.json', created: 42 })]
    const deltas = getRunCreatedDeltas(items)
    expect(deltas.has('only.json')).toBe(false)
  })

  it('computes the delta against the previous chronological run with the same signature', () => {
    const items = [
      run({ file: 'first.json', startedAt: '2026-09-01T10:00:00.000Z', created: 10 }),
      run({ file: 'second.json', startedAt: '2026-09-02T10:00:00.000Z', created: 25 })
    ]
    const deltas = getRunCreatedDeltas(items)
    expect(deltas.get('second.json')).toBe(15)
    expect(deltas.has('first.json')).toBe(false)
  })

  it('does not compare across a changed signature', () => {
    const items = [
      run({
        file: 'first.json',
        startedAt: '2026-09-01T10:00:00.000Z',
        created: 10,
        targetLanguages: ['fr']
      }),
      run({
        file: 'second.json',
        startedAt: '2026-09-02T10:00:00.000Z',
        created: 999,
        targetLanguages: ['de']
      })
    ]
    const deltas = getRunCreatedDeltas(items)
    expect(deltas.has('second.json')).toBe(false)
  })

  it('does not compare runs that differ only by selectedMods', () => {
    const items = [
      run({
        file: 'first.json',
        startedAt: '2026-09-01T10:00:00.000Z',
        created: 80,
        selectedMods: 3
      }),
      run({
        file: 'second.json',
        startedAt: '2026-09-02T10:00:00.000Z',
        created: 9000,
        selectedMods: 'all'
      })
    ]
    expect(getRunCreatedDeltas(items).has('second.json')).toBe(false)
  })

  it('does not compare runs that differ only by rootPath', () => {
    const items = [
      run({ file: 'first.json', startedAt: '2026-09-01T10:00:00.000Z', created: 10 }),
      run({
        file: 'second.json',
        startedAt: '2026-09-02T10:00:00.000Z',
        created: 999,
        rootPath: 'D:/other-mods'
      })
    ]
    expect(getRunCreatedDeltas(items).has('second.json')).toBe(false)
  })

  it('does not compare runs that differ only by sourceLanguage', () => {
    const items = [
      run({ file: 'first.json', startedAt: '2026-09-01T10:00:00.000Z', created: 10 }),
      run({
        file: 'second.json',
        startedAt: '2026-09-02T10:00:00.000Z',
        created: 999,
        sourceLanguage: 'de'
      })
    ]
    expect(getRunCreatedDeltas(items).has('second.json')).toBe(false)
  })

  it('does not collide two runs whose rootPath contains the separator character', () => {
    const items = [
      run({
        file: 'first.json',
        startedAt: '2026-09-01T10:00:00.000Z',
        created: 10,
        rootPath: 'C:/mods|de',
        targetLanguages: ['fr']
      }),
      run({
        file: 'second.json',
        startedAt: '2026-09-02T10:00:00.000Z',
        created: 999,
        rootPath: 'C:/mods',
        targetLanguages: ['de', 'fr']
      })
    ]
    expect(getRunCreatedDeltas(items).has('second.json')).toBe(false)
  })

  it('ignores the order of targetLanguages', () => {
    const items = [
      run({
        file: 'first.json',
        startedAt: '2026-09-01T10:00:00.000Z',
        created: 10,
        targetLanguages: ['fr', 'de']
      }),
      run({
        file: 'second.json',
        startedAt: '2026-09-02T10:00:00.000Z',
        created: 25,
        targetLanguages: ['de', 'fr']
      })
    ]
    expect(getRunCreatedDeltas(items).get('second.json')).toBe(15)
  })

  it('is computed over the whole list regardless of input order', () => {
    const items = [
      run({ file: 'second.json', startedAt: '2026-09-02T10:00:00.000Z', created: 25 }),
      run({ file: 'first.json', startedAt: '2026-09-01T10:00:00.000Z', created: 10 })
    ]
    const deltas = getRunCreatedDeltas(items)
    expect(deltas.get('second.json')).toBe(15)
  })
})

describe('buildGameFilterOptions', () => {
  it('counts runs per game', () => {
    const items = [run({ game: 'ck3' }), run({ game: 'ck3' }), run({ game: 'hoi4' })]
    expect(buildGameFilterOptions(items)).toEqual([
      { id: 'ck3', count: 2 },
      { id: 'hoi4', count: 1 }
    ])
  })

  it('returns an empty array for no runs', () => {
    expect(buildGameFilterOptions([])).toEqual([])
  })
})
