import { describe, expect, it } from 'vitest'

import type { DetectedPathSuggestion } from './detected-paths.js'
import type { KnownPathEntry } from './known-paths.js'
import { filterPathGroups, matchesPathQuery, PATH_CATEGORY_FILTERS } from './path-search.js'

const makeEntry = (overrides: Partial<KnownPathEntry> = {}): KnownPathEntry => ({
  path: '/mods/example',
  gameId: 'stellaris',
  kind: 'modFolder',
  lastUsedAt: '2024-06-01T00:00:00.000Z',
  pinned: false,
  ...overrides
})

const makeSuggestion = (
  overrides: Partial<DetectedPathSuggestion> = {}
): DetectedPathSuggestion => ({
  kind: 'workshopContent',
  path: '/steam/stellaris',
  ...overrides
})

describe('matchesPathQuery', () => {
  it('matches everything for an empty query', () => {
    expect(matchesPathQuery('/mods/example', '')).toBe(true)
  })

  it('matches everything for a whitespace-only query', () => {
    expect(matchesPathQuery('/mods/example', '   ')).toBe(true)
  })

  it('matches on the full path, case-insensitively', () => {
    expect(matchesPathQuery('C:/SteamLibrary/Stellaris', 'steamlibrary')).toBe(true)
  })

  it('matches on the displayed title, case-insensitively', () => {
    const path = 'C:/SteamLibrary/steamapps/workshop/content/281990/123456'
    expect(matchesPathQuery(path, 'CONTENT')).toBe(true)
  })

  it('does not match an unrelated query', () => {
    expect(matchesPathQuery('/mods/example', 'nope')).toBe(false)
  })
})

describe('filterPathGroups', () => {
  const pinned = makeEntry({ path: '/mods/pinned-alpha', pinned: true })
  const detected = makeSuggestion({ path: '/steam/detected-beta' })
  const recent = makeEntry({ path: '/mods/recent-gamma', pinned: false })
  const groups = { pinned: [pinned], detected: [detected], recent: [recent] }

  it('shows all three groups for "all"', () => {
    expect(filterPathGroups(groups, 'all', '')).toEqual(groups)
  })

  it('shows only pinned for "pinned"', () => {
    expect(filterPathGroups(groups, 'pinned', '')).toEqual({
      pinned: [pinned],
      detected: [],
      recent: []
    })
  })

  it('shows only detected for "detected"', () => {
    expect(filterPathGroups(groups, 'detected', '')).toEqual({
      pinned: [],
      detected: [detected],
      recent: []
    })
  })

  it('shows only recent for "recent"', () => {
    expect(filterPathGroups(groups, 'recent', '')).toEqual({
      pinned: [],
      detected: [],
      recent: [recent]
    })
  })

  it('keeps applying the search query alongside an active category filter', () => {
    expect(filterPathGroups(groups, 'pinned', 'alpha')).toEqual({
      pinned: [pinned],
      detected: [],
      recent: []
    })
    expect(filterPathGroups(groups, 'pinned', 'gamma')).toEqual({
      pinned: [],
      detected: [],
      recent: []
    })
  })

  it('filters every visible group by the search query when the filter is "all"', () => {
    expect(filterPathGroups(groups, 'all', 'beta')).toEqual({
      pinned: [],
      detected: [detected],
      recent: []
    })
  })

  it('exposes exactly the four expected category values', () => {
    expect(PATH_CATEGORY_FILTERS).toEqual(['all', 'pinned', 'detected', 'recent'])
  })
})
