import type { DetectedPathSuggestion } from './detected-paths.js'
import { groupByPinned, sortRecent, type KnownPathEntry } from './known-paths.js'

const DEFAULT_CASE_SENSITIVE = false

export interface PathGroups {
  pinned: KnownPathEntry[]
  detected: DetectedPathSuggestion[]
  recent: KnownPathEntry[]
}

const normalizePathSeparators = (path: string): string => path.replaceAll('\\', '/')

export const canonicalPathKey = (
  path: string,
  caseSensitive: boolean = DEFAULT_CASE_SENSITIVE
): string => {
  const normalized = normalizePathSeparators(path).replace(/\/+$/, '')
  return caseSensitive ? normalized : normalized.toLowerCase()
}

const dedupeByPath = <T extends { path: string }>(
  entries: readonly T[],
  caseSensitive: boolean
): T[] => {
  const seenKeys = new Set<string>()
  const deduped: T[] = []
  for (const entry of entries) {
    const key = canonicalPathKey(entry.path, caseSensitive)
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    deduped.push(entry)
  }
  return deduped
}

export const buildPathGroups = (
  knownEntries: readonly KnownPathEntry[],
  detectedSuggestions: readonly DetectedPathSuggestion[],
  caseSensitive: boolean = DEFAULT_CASE_SENSITIVE
): PathGroups => {
  const { pinned: pinnedRaw, recent: unsortedRecent } = groupByPinned(knownEntries)
  const pinned = dedupeByPath(pinnedRaw, caseSensitive)
  const recentByRecency = dedupeByPath(sortRecent(unsortedRecent), caseSensitive)

  const pinnedKeys = new Set(pinned.map(entry => canonicalPathKey(entry.path, caseSensitive)))

  const detected = dedupeByPath(
    detectedSuggestions.filter(
      suggestion => !pinnedKeys.has(canonicalPathKey(suggestion.path, caseSensitive))
    ),
    caseSensitive
  )
  const detectedKeys = new Set(
    detected.map(suggestion => canonicalPathKey(suggestion.path, caseSensitive))
  )

  const recent = recentByRecency.filter(entry => {
    const key = canonicalPathKey(entry.path, caseSensitive)
    return !pinnedKeys.has(key) && !detectedKeys.has(key)
  })

  return { pinned, detected, recent }
}
