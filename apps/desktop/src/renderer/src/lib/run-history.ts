import type { RunReportSummary } from '@ptt/report'

import { getDayKey } from './format-datetime'

export type RunSortKey = 'date' | 'created' | 'failed' | 'errors' | 'seconds'
export type RunOutcomeFilter = 'all' | 'issues' | 'clean'

export interface RunHistoryQuery {
  outcome: RunOutcomeFilter
  gameId: string | 'all'
  search: string
}

export interface RunHistoryLabels {
  games: Record<string, string>
  languages: Record<string, string>
  modes: Record<string, string>
}

export interface RunDayGroup {
  key: string
  iso: string
  items: RunReportSummary[]
}

export const RUNS_PER_PAGE = 10

const ISSUE_OUTCOMES: ReadonlySet<RunReportSummary['outcome']> = new Set([
  'failed',
  'issues',
  'cancelled'
])

const matchesOutcome = (item: RunReportSummary, outcome: RunOutcomeFilter): boolean => {
  switch (outcome) {
    case 'all':
      return true
    case 'issues':
      return ISSUE_OUTCOMES.has(item.outcome)
    case 'clean':
      return item.outcome === 'clean'
  }
}

const matchesGame = (item: RunReportSummary, gameId: string | 'all'): boolean =>
  gameId === 'all' || item.game === gameId

const matchesSearch = (
  item: RunReportSummary,
  search: string,
  labels: RunHistoryLabels
): boolean => {
  const query = search.trim().toLowerCase()
  if (query === '') return true

  const gameLabel = labels.games[item.game] ?? item.game
  const modeLabel = labels.modes[item.mode] ?? item.mode
  const languageLabels = item.targetLanguages.map(code => labels.languages[code] ?? code)

  const haystack = [item.game, gameLabel, item.mode, modeLabel, ...languageLabels]
    .join(' ')
    .toLowerCase()
  return haystack.includes(query)
}

export const filterRuns = (
  items: readonly RunReportSummary[],
  query: RunHistoryQuery,
  labels: RunHistoryLabels
): RunReportSummary[] =>
  items.filter(
    item =>
      matchesOutcome(item, query.outcome) &&
      matchesGame(item, query.gameId) &&
      matchesSearch(item, query.search, labels)
  )

const RUN_COMPARATORS: Record<RunSortKey, (a: RunReportSummary, b: RunReportSummary) => number> = {
  date: (a, b) => (a.startedAt === b.startedAt ? 0 : a.startedAt > b.startedAt ? -1 : 1),
  created: (a, b) => b.created - a.created,
  failed: (a, b) => b.failed - a.failed,
  errors: (a, b) => b.errors - a.errors,
  seconds: (a, b) => b.seconds - a.seconds
}

export const sortRuns = (
  items: readonly RunReportSummary[],
  sort: RunSortKey
): RunReportSummary[] => items.toSorted(RUN_COMPARATORS[sort])

export const getPageCount = (total: number, perPage: number = RUNS_PER_PAGE): number =>
  Math.max(1, Math.ceil(total / perPage))

export const getPageSlice = <T>(
  items: readonly T[],
  page: number,
  perPage: number = RUNS_PER_PAGE
): T[] => {
  const pageCount = getPageCount(items.length, perPage)
  const clampedPage = Math.min(Math.max(page, 1), pageCount)
  const start = (clampedPage - 1) * perPage
  return items.slice(start, start + perPage)
}

export const groupRunsByDay = (items: readonly RunReportSummary[]): RunDayGroup[] => {
  const groups: RunDayGroup[] = []
  for (const item of items) {
    const key = getDayKey(item.startedAt)
    const last = groups[groups.length - 1]
    if (last && last.key === key) {
      last.items.push(item)
    } else {
      groups.push({ key, iso: item.startedAt, items: [item] })
    }
  }
  return groups
}

const buildSignature = (item: RunReportSummary): string =>
  JSON.stringify([
    item.game,
    item.mode,
    item.targetContent ?? null,
    item.sourceLanguage,
    item.selectedMods,
    item.rootPath,
    [...item.targetLanguages].toSorted()
  ])

export const getRunCreatedDeltas = (
  items: readonly RunReportSummary[]
): ReadonlyMap<string, number> => {
  const chronological = [...items].toSorted((a, b) => a.startedAt.localeCompare(b.startedAt))
  const lastCreatedBySignature = new Map<string, number>()
  const deltas = new Map<string, number>()

  for (const item of chronological) {
    const signature = buildSignature(item)
    const previousCreated = lastCreatedBySignature.get(signature)
    if (previousCreated !== undefined) {
      deltas.set(item.file, item.created - previousCreated)
    }
    lastCreatedBySignature.set(signature, item.created)
  }

  return deltas
}

export const buildGameFilterOptions = (
  items: readonly RunReportSummary[]
): { id: string; count: number }[] => {
  const counts = new Map<string, number>()
  for (const item of items) counts.set(item.game, (counts.get(item.game) ?? 0) + 1)
  return [...counts]
    .map(([id, count]) => ({ id, count }))
    .toSorted((a, b) => b.count - a.count || a.id.localeCompare(b.id))
}
