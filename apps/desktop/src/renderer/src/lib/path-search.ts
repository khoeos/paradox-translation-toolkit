import { toPathDisplay } from './detected-paths.js'
import type { PathGroups } from './path-groups.js'

export const PATH_CATEGORY_FILTERS = ['all', 'pinned', 'detected', 'recent'] as const

export type PathCategoryFilter = (typeof PATH_CATEGORY_FILTERS)[number]

export const matchesPathQuery = (path: string, query: string): boolean => {
  const trimmedQuery = query.trim().toLowerCase()
  if (trimmedQuery.length === 0) return true
  const title = toPathDisplay(path).title.toLowerCase()
  return title.includes(trimmedQuery) || path.toLowerCase().includes(trimmedQuery)
}

export const filterPathGroups = (
  groups: PathGroups,
  filter: PathCategoryFilter,
  query: string
): PathGroups => {
  const showPinned = filter === 'all' || filter === 'pinned'
  const showDetected = filter === 'all' || filter === 'detected'
  const showRecent = filter === 'all' || filter === 'recent'

  return {
    pinned: showPinned ? groups.pinned.filter(entry => matchesPathQuery(entry.path, query)) : [],
    detected: showDetected
      ? groups.detected.filter(suggestion => matchesPathQuery(suggestion.path, query))
      : [],
    recent: showRecent ? groups.recent.filter(entry => matchesPathQuery(entry.path, query)) : []
  }
}
