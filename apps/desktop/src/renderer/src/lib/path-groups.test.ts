import { describe, expect, it } from 'vitest'

import type { DetectedPathSuggestion } from './detected-paths.js'
import type { KnownPathEntry } from './known-paths.js'
import { buildPathGroups, canonicalPathKey } from './path-groups.js'

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

describe('canonicalPathKey', () => {
  it('folds case by default', () => {
    expect(canonicalPathKey('C:/Steam/Stellaris')).toBe(canonicalPathKey('c:/steam/stellaris'))
  })

  it('keeps case-sensitive comparison distinct when asked to', () => {
    expect(canonicalPathKey('C:/Steam/Stellaris', true)).not.toBe(
      canonicalPathKey('c:/steam/stellaris', true)
    )
  })

  it('normalizes backslashes to forward slashes', () => {
    expect(canonicalPathKey('C:\\Steam\\Stellaris')).toBe(canonicalPathKey('C:/Steam/Stellaris'))
  })

  it('drops a trailing slash', () => {
    expect(canonicalPathKey('C:/Steam/Stellaris/')).toBe(canonicalPathKey('C:/Steam/Stellaris'))
  })
})

describe('buildPathGroups', () => {
  it('splits entries with no overlap into their three groups', () => {
    const pinned = makeEntry({ path: '/mods/pinned', pinned: true })
    const recent = makeEntry({ path: '/mods/recent', pinned: false })
    const suggestion = makeSuggestion({ path: '/steam/detected' })

    expect(buildPathGroups([pinned, recent], [suggestion])).toEqual({
      pinned: [pinned],
      detected: [suggestion],
      recent: [recent]
    })
  })

  it('removes a pinned path from detected and recent (pinned precedence)', () => {
    const shared = '/mods/shared'
    const pinned = makeEntry({ path: shared, pinned: true })
    const recentDuplicate = makeEntry({ path: shared, pinned: false })
    const detectedDuplicate = makeSuggestion({ path: shared })

    const groups = buildPathGroups([pinned, recentDuplicate], [detectedDuplicate])

    expect(groups.pinned).toEqual([pinned])
    expect(groups.detected).toEqual([])
    expect(groups.recent).toEqual([])
  })

  it('removes a detected path from recent (detected precedence over recent)', () => {
    const shared = '/mods/shared'
    const recentDuplicate = makeEntry({ path: shared, pinned: false })
    const detectedDuplicate = makeSuggestion({ path: shared })

    const groups = buildPathGroups([recentDuplicate], [detectedDuplicate])

    expect(groups.pinned).toEqual([])
    expect(groups.detected).toEqual([detectedDuplicate])
    expect(groups.recent).toEqual([])
  })

  it('deduplicates across a case and separator difference', () => {
    const pinned = makeEntry({ path: 'C:/Mods/Shared', pinned: true })
    const detectedDuplicate = makeSuggestion({ path: 'c:\\mods\\shared' })

    const groups = buildPathGroups([pinned], [detectedDuplicate])

    expect(groups.pinned).toEqual([pinned])
    expect(groups.detected).toEqual([])
  })

  it('never lets the same path appear twice across the three groups', () => {
    const shared = '/mods/everywhere'
    const pinned = makeEntry({ path: shared, pinned: true })
    const recentDuplicate = makeEntry({ path: shared, pinned: false })
    const detectedDuplicate = makeSuggestion({ path: shared })

    const groups = buildPathGroups([pinned, recentDuplicate], [detectedDuplicate])
    const allPaths = [
      ...groups.pinned.map(entry => entry.path),
      ...groups.detected.map(suggestion => suggestion.path),
      ...groups.recent.map(entry => entry.path)
    ]

    expect(allPaths).toEqual([shared])
  })

  it('sorts recent entries from most recently used to oldest', () => {
    const older = makeEntry({ path: '/mods/old', lastUsedAt: '2024-01-01T00:00:00.000Z' })
    const newer = makeEntry({ path: '/mods/new', lastUsedAt: '2024-06-01T00:00:00.000Z' })

    expect(buildPathGroups([older, newer], []).recent).toEqual([newer, older])
  })

  it('returns empty groups for empty inputs', () => {
    expect(buildPathGroups([], [])).toEqual({ pinned: [], detected: [], recent: [] })
  })

  it('deduplicates two recent entries for the same path differing only by case, keeping the most recently used one', () => {
    const older = makeEntry({ path: '/mods/Case', lastUsedAt: '2024-01-01T00:00:00.000Z' })
    const newer = makeEntry({ path: '/mods/case', lastUsedAt: '2024-06-01T00:00:00.000Z' })

    const groups = buildPathGroups([older, newer], [])

    expect(groups.recent).toEqual([newer])
  })
})
