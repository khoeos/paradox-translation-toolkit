import type { AppRouter } from '@main/ipc/trpc-router'
import type { inferRouterOutputs } from '@trpc/server'

type RouterOutputs = inferRouterOutputs<AppRouter>

export type KnownPathEntry = RouterOutputs['settings']['getAll']['knownPaths'][number]
export type PathValidationStatus = RouterOutputs['fs']['validatePath']
export type KnownPathKind = KnownPathEntry['kind']

export interface GroupedKnownPaths {
  pinned: KnownPathEntry[]
  recent: KnownPathEntry[]
}

export interface ClickedPathResult {
  status: PathValidationStatus
  path: string
}

export const filterByGame = (
  entries: readonly KnownPathEntry[],
  gameId: string,
  kind: KnownPathKind
): KnownPathEntry[] => entries.filter(entry => entry.gameId === gameId && entry.kind === kind)

export const groupByPinned = (entries: readonly KnownPathEntry[]): GroupedKnownPaths => {
  const pinned: KnownPathEntry[] = []
  const recent: KnownPathEntry[] = []
  for (const entry of entries) {
    if (entry.pinned) pinned.push(entry)
    else recent.push(entry)
  }
  return { pinned, recent }
}

export const sortRecent = (entries: readonly KnownPathEntry[]): KnownPathEntry[] =>
  entries.toSorted((a, b) => Date.parse(b.lastUsedAt) - Date.parse(a.lastUsedAt))

export const resolveClickedPath = async (
  entry: KnownPathEntry,
  validate: (path: string) => Promise<PathValidationStatus>
): Promise<ClickedPathResult> => {
  const status = await validate(entry.path)
  return { status, path: entry.path }
}
