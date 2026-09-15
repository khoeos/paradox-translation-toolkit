import { describe, expect, it } from 'vitest'

import {
  filterByGame,
  groupByPinned,
  resolveClickedPath,
  sortRecent,
  type KnownPathEntry,
  type PathValidationStatus
} from './known-paths.js'

const makeEntry = (overrides: Partial<KnownPathEntry> = {}): KnownPathEntry => ({
  path: '/mods/example',
  gameId: 'stellaris',
  kind: 'modFolder',
  lastUsedAt: '2024-06-01T00:00:00.000Z',
  pinned: false,
  ...overrides
})

describe('filterByGame', () => {
  it('returns nothing for an empty list', () => {
    expect(filterByGame([], 'stellaris', 'modFolder')).toEqual([])
  })

  it('keeps only entries for the requested game', () => {
    const stellarisEntry = makeEntry({ path: '/mods/a', gameId: 'stellaris' })
    const eu4Entry = makeEntry({ path: '/mods/b', gameId: 'eu4' })
    expect(filterByGame([stellarisEntry, eu4Entry], 'stellaris', 'modFolder')).toEqual([
      stellarisEntry
    ])
  })

  it('keeps only entries for the requested kind', () => {
    const modFolderEntry = makeEntry({ path: '/mods/a', kind: 'modFolder' })
    const gameInstallEntry = makeEntry({ path: '/games/a', kind: 'gameInstall' })
    expect(filterByGame([modFolderEntry, gameInstallEntry], 'stellaris', 'modFolder')).toEqual([
      modFolderEntry
    ])
  })
})

describe('groupByPinned', () => {
  it('returns two empty groups for an empty list', () => {
    expect(groupByPinned([])).toEqual({ pinned: [], recent: [] })
  })

  it('puts every entry in pinned when every entry is pinned', () => {
    const first = makeEntry({ path: '/mods/a', pinned: true })
    const second = makeEntry({ path: '/mods/b', pinned: true })
    expect(groupByPinned([first, second])).toEqual({ pinned: [first, second], recent: [] })
  })

  it('splits pinned from recent', () => {
    const pinned = makeEntry({ path: '/mods/a', pinned: true })
    const recent = makeEntry({ path: '/mods/b', pinned: false })
    expect(groupByPinned([pinned, recent])).toEqual({ pinned: [pinned], recent: [recent] })
  })
})

describe('sortRecent', () => {
  it('returns an empty list unchanged', () => {
    expect(sortRecent([])).toEqual([])
  })

  it('orders from most recent to oldest', () => {
    const older = makeEntry({ path: '/mods/old', lastUsedAt: '2024-01-01T00:00:00.000Z' })
    const newer = makeEntry({ path: '/mods/new', lastUsedAt: '2024-06-01T00:00:00.000Z' })
    expect(sortRecent([older, newer])).toEqual([newer, older])
  })

  it('keeps the original relative order for equal timestamps', () => {
    const first = makeEntry({ path: '/mods/first', lastUsedAt: '2024-06-01T00:00:00.000Z' })
    const second = makeEntry({ path: '/mods/second', lastUsedAt: '2024-06-01T00:00:00.000Z' })
    const third = makeEntry({ path: '/mods/third', lastUsedAt: '2024-06-01T00:00:00.000Z' })
    expect(sortRecent([first, second, third])).toEqual([first, second, third])
  })

  it('tolerates an invalid lastUsedAt without throwing', () => {
    const valid = makeEntry({ path: '/mods/valid', lastUsedAt: '2024-06-01T00:00:00.000Z' })
    const invalid = makeEntry({ path: '/mods/invalid', lastUsedAt: '' })
    expect(() => sortRecent([valid, invalid])).not.toThrow()
  })
})

describe('resolveClickedPath', () => {
  const entry = makeEntry({ path: '/mods/example' })

  const withStatus =
    (status: PathValidationStatus) =>
    async (path: string): Promise<PathValidationStatus> => {
      expect(path).toBe(entry.path)
      return status
    }

  it('resolves ok when the path is still valid', async () => {
    expect(await resolveClickedPath(entry, withStatus('ok'))).toEqual({
      status: 'ok',
      path: entry.path
    })
  })

  it('resolves not-found when the path disappeared', async () => {
    expect(await resolveClickedPath(entry, withStatus('not-found'))).toEqual({
      status: 'not-found',
      path: entry.path
    })
  })

  it('resolves critical when the path is now a protected system folder', async () => {
    expect(await resolveClickedPath(entry, withStatus('critical'))).toEqual({
      status: 'critical',
      path: entry.path
    })
  })
})
