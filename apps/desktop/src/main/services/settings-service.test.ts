import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: vi.fn(() => '/tmp/ptt-test') } }))

vi.mock('electron-log/main.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('electron-store', () => ({
  default: class {
    get = vi.fn()
    set = vi.fn()
  }
}))

import { TRANSLATE_DEFAULTS } from '@ptt/translate/defaults'

import {
  addKnownPathEntry,
  addKnownPathEntryOn,
  clearKnownPathEntries,
  DEFAULTS,
  filterKnownPaths,
  KnownPathEntrySchemaZod,
  mergeDuplicateKnownPaths,
  migrateSettings,
  pruneKnownPaths,
  reconcileSettingsState,
  removeKnownPathEntry,
  sameKnownPathOn,
  SettingsSchemaZod,
  togglePinKnownPathEntry,
  type KnownPathEntry,
  type SettingsSchema
} from './settings-service.js'

describe('migrateSettings', () => {
  it('maps the legacy overwrite:true to complete-file, not regenerate-file', () => {
    expect(migrateSettings({ overwrite: true })).toEqual({ targetContent: 'complete-file' })
  })

  it('maps the legacy overwrite:false to missing-keys', () => {
    expect(migrateSettings({ overwrite: false })).toEqual({ targetContent: 'missing-keys' })
  })

  it('returns an empty patch when the legacy key is absent, leaving the default to apply', () => {
    expect(migrateSettings({ mode: 'add-to-current' })).toEqual({})
  })

  it('returns an empty patch when overwrite is present but not a boolean', () => {
    expect(migrateSettings({ overwrite: 'true' })).toEqual({})
    expect(migrateSettings({ overwrite: 1 })).toEqual({})
    expect(migrateSettings({ overwrite: null })).toEqual({})
  })

  it('returns an empty patch when raw is not an object', () => {
    expect(migrateSettings(null)).toEqual({})
    expect(migrateSettings(undefined)).toEqual({})
    expect(migrateSettings('overwrite')).toEqual({})
    expect(migrateSettings(42)).toEqual({})
  })

  it('derives built-in targets from a 3.0.0 store with no overwrite key at all', () => {
    const raw = { targetLanguages: { stellaris: ['fr', 'tr'] } }
    expect(migrateSettings(raw)).toEqual({
      targets: { stellaris: [{ language: 'fr', fileToken: 'french' }] }
    })
  })

  it('drops a target language the game does not ship, from every entry', () => {
    expect(migrateSettings({ targetLanguages: { stellaris: ['tr'] } })).toEqual({})
  })

  it('drops every language for an unknown game id', () => {
    expect(migrateSettings({ targetLanguages: { madeUpGame: ['fr'] } })).toEqual({})
  })

  it('skips a targetLanguages entry that is not an array', () => {
    expect(migrateSettings({ targetLanguages: { stellaris: 'fr' } })).toEqual({})
  })

  it('leaves a game with an already non-empty targets entry untouched', () => {
    const raw = {
      targetLanguages: { stellaris: ['fr'] },
      targets: { stellaris: [{ language: 'de', fileToken: 'german' }] }
    }
    expect(migrateSettings(raw)).toEqual({})
  })

  it('still derives targets for a game whose existing targets entry is empty', () => {
    const raw = { targetLanguages: { stellaris: ['fr'] }, targets: { stellaris: [] } }
    expect(migrateSettings(raw)).toEqual({
      targets: { stellaris: [{ language: 'fr', fileToken: 'french' }] }
    })
  })

  it('carries other games through the patch, since targets is replaced as a whole key', () => {
    const raw = {
      targetLanguages: { stellaris: ['fr'] },
      targets: { stellaris: [], eu4: [{ language: 'Catalan', fileToken: 'english' }] }
    }
    expect(migrateSettings(raw)).toEqual({
      targets: {
        stellaris: [{ language: 'fr', fileToken: 'french' }],
        eu4: [{ language: 'Catalan', fileToken: 'english' }]
      }
    })
  })

  it('still migrates overwrite alongside targets when both legacy keys are present', () => {
    const raw = { overwrite: true, targetLanguages: { stellaris: ['fr'] } }
    expect(migrateSettings(raw)).toEqual({
      targetContent: 'complete-file',
      targets: { stellaris: [{ language: 'fr', fileToken: 'french' }] }
    })
  })
})

describe('SettingsSchemaZod.shape.targets', () => {
  it('round trips a per-game list of translation targets, custom token included', () => {
    const value = { stellaris: [{ language: 'tr', fileToken: 'english' }] }
    const result = SettingsSchemaZod.shape.targets.safeParse(value)
    expect(result).toMatchObject({ success: true, data: value })
  })

  it('accepts an empty array, a legal saved state with nothing selected', () => {
    expect(SettingsSchemaZod.shape.targets.safeParse({ stellaris: [] }).success).toBe(true)
  })

  it('rejects a target with an invalid file token, without affecting other fields', () => {
    const invalid = { stellaris: [{ language: 'tr', fileToken: 'L_BAD' }] }
    expect(SettingsSchemaZod.shape.targets.safeParse(invalid).success).toBe(false)
    expect(SettingsSchemaZod.shape.mode.safeParse('add-to-current').success).toBe(true)
  })
})

const makeEntry = (overrides: Partial<KnownPathEntry> = {}): KnownPathEntry => ({
  path: '/mods/example',
  gameId: 'stellaris',
  kind: 'modFolder',
  lastUsedAt: '2024-01-01T00:00:00.000Z',
  pinned: false,
  ...overrides
})

describe('filterKnownPaths', () => {
  it('drops only the entry with a non-boolean pinned, the two valid ones survive', () => {
    const good1 = makeEntry({ path: '/mods/a' })
    const good2 = makeEntry({ path: '/mods/b' })
    const bad = {
      path: '/mods/c',
      gameId: 'stellaris',
      kind: 'modFolder',
      lastUsedAt: '2024-01-01T00:00:00.000Z',
      pinned: 'yes'
    }

    const result = filterKnownPaths([good1, bad, good2])

    expect(result.entries).toEqual([good1, good2])
    expect(result.droppedCount).toBe(1)
  })

  it('falls back to an empty array when the raw value is not an array at all', () => {
    expect(filterKnownPaths({ path: '/mods/a' })).toEqual({
      entries: [],
      droppedCount: 0,
      migratedCount: 0
    })
    expect(filterKnownPaths(null)).toEqual({ entries: [], droppedCount: 0, migratedCount: 0 })
    expect(filterKnownPaths(undefined)).toEqual({ entries: [], droppedCount: 0, migratedCount: 0 })
  })

  it('drops a non-ISO lastUsedAt instead of letting it corrupt the prune sort', () => {
    const good = makeEntry({ path: '/mods/a' })
    const nonIso = {
      path: '/mods/b',
      gameId: 'stellaris',
      kind: 'modFolder',
      lastUsedAt: '9999999999',
      pinned: false
    }

    const result = filterKnownPaths([good, nonIso])

    expect(result.entries).toEqual([good])
    expect(result.droppedCount).toBe(1)
  })

  it('does not let a throwing accessor on one entry escape the loop', () => {
    const evil = {
      get path() {
        throw new Error('boom from getter')
      },
      gameId: 'stellaris',
      kind: 'modFolder',
      lastUsedAt: '2024-01-01T00:00:00.000Z',
      pinned: false
    }
    const good = makeEntry({ path: '/mods/survivor' })

    let result
    expect(() => {
      result = filterKnownPaths([evil, good])
    }).not.toThrow()

    expect(result).toEqual({ entries: [good], droppedCount: 1, migratedCount: 0 })
  })

  it('merges pre-existing exact duplicates, keeping the newest lastUsedAt and the pinned state of either', () => {
    const older = makeEntry({
      path: '/mods/dup',
      lastUsedAt: '2020-01-01T00:00:00.000Z',
      pinned: true
    })
    const newer = { ...older, lastUsedAt: '2024-01-01T00:00:00.000Z', pinned: false }

    const result = filterKnownPaths([older, newer])

    expect(result.entries).toEqual([{ ...newer, pinned: true }])
    expect(result.droppedCount).toBe(0)
  })

  it('never merges the same path recorded for two different games', () => {
    const forStellaris = makeEntry({ path: '/mods/shared', gameId: 'stellaris' })
    const forEu4 = makeEntry({ path: '/mods/shared', gameId: 'eu4' })

    const result = filterKnownPaths([forStellaris, forEu4])

    expect(result.entries).toHaveLength(2)
  })

  it('never merges the same path recorded for two different kinds of the same game', () => {
    const modFolder = makeEntry({ path: '/paths/shared', kind: 'modFolder' })
    const gameInstall = makeEntry({ path: '/paths/shared', kind: 'gameInstall' })

    const result = filterKnownPaths([modFolder, gameInstall])

    expect(result.entries).toHaveLength(2)
  })

  it('defaults a legacy entry with no kind field at all to modFolder and reports it as migrated', () => {
    const legacy = {
      path: '/mods/legacy',
      gameId: 'stellaris',
      lastUsedAt: '2024-01-01T00:00:00.000Z',
      pinned: false
    }

    const result = filterKnownPaths([legacy])

    expect(result.droppedCount).toBe(0)
    expect(result.migratedCount).toBe(1)
    expect(result.entries).toEqual([{ ...legacy, kind: 'modFolder' }])
  })

  it('keeps every legacy entry lacking a kind field, migrating all of them to modFolder', () => {
    const legacyEntries = Array.from({ length: 3 }, (_, i) => ({
      path: `/mods/legacy-${i}`,
      gameId: 'stellaris',
      lastUsedAt: `2024-01-0${i + 1}T00:00:00.000Z`,
      pinned: false
    }))

    const result = filterKnownPaths(legacyEntries)

    expect(result.droppedCount).toBe(0)
    expect(result.migratedCount).toBe(3)
    expect(result.entries).toHaveLength(3)
    expect(result.entries.every(entry => entry.kind === 'modFolder')).toBe(true)
  })
})

describe('KnownPathEntrySchemaZod', () => {
  it('rejects a lastUsedAt that is not a valid ISO datetime, even when it sorts numerically correctly', () => {
    const entry = {
      path: '/mods/a',
      gameId: 'stellaris',
      kind: 'modFolder',
      lastUsedAt: '9999999999',
      pinned: false
    }

    expect(KnownPathEntrySchemaZod.safeParse(entry).success).toBe(false)
  })

  it('accepts the shape produced by new Date().toISOString()', () => {
    const entry = {
      path: '/mods/a',
      gameId: 'stellaris',
      kind: 'modFolder',
      lastUsedAt: new Date().toISOString(),
      pinned: false
    }

    expect(KnownPathEntrySchemaZod.safeParse(entry).success).toBe(true)
  })

  it('rejects an unknown kind', () => {
    const entry = {
      path: '/mods/a',
      gameId: 'stellaris',
      kind: 'somethingElse',
      lastUsedAt: new Date().toISOString(),
      pinned: false
    }

    expect(KnownPathEntrySchemaZod.safeParse(entry).success).toBe(false)
  })

  it('defaults a missing kind to modFolder instead of rejecting the entry', () => {
    const entry = {
      path: '/mods/a',
      gameId: 'stellaris',
      lastUsedAt: new Date().toISOString(),
      pinned: false
    }

    const result = KnownPathEntrySchemaZod.safeParse(entry)

    expect(result.success).toBe(true)
    expect(result.success && result.data.kind).toBe('modFolder')
  })
})

describe('mergeDuplicateKnownPaths', () => {
  it('folds case-differing paths on darwin and win32', () => {
    const a = makeEntry({ path: '/mods/CaseTest', lastUsedAt: '2020-01-01T00:00:00.000Z' })
    const b = makeEntry({ path: '/MODS/casetest', lastUsedAt: '2024-01-01T00:00:00.000Z' })

    expect(mergeDuplicateKnownPaths('darwin', [a, b])).toHaveLength(1)
    expect(mergeDuplicateKnownPaths('win32', [a, b])).toHaveLength(1)
  })

  it('keeps case-differing paths distinct on linux, never merging two real distinct folders', () => {
    const a = makeEntry({ path: '/mods/CaseTest' })
    const b = makeEntry({ path: '/mods/casetest' })

    expect(mergeDuplicateKnownPaths('linux', [a, b])).toHaveLength(2)
  })

  it('never merges the identical path recorded under two different kinds', () => {
    const a = makeEntry({ path: '/paths/shared', kind: 'modFolder' })
    const b = makeEntry({ path: '/paths/shared', kind: 'gameInstall' })

    expect(mergeDuplicateKnownPaths('darwin', [a, b])).toHaveLength(2)
  })
})

describe('sameKnownPathOn', () => {
  it('matches case-differing paths on darwin', () => {
    const entry = makeEntry({ path: '/mods/CaseTest', gameId: 'stellaris' })

    expect(sameKnownPathOn('darwin', entry, '/MODS/casetest', 'stellaris', 'modFolder')).toBe(true)
  })

  it('does not match case-differing paths on linux', () => {
    const entry = makeEntry({ path: '/mods/CaseTest', gameId: 'stellaris' })

    expect(sameKnownPathOn('linux', entry, '/mods/casetest', 'stellaris', 'modFolder')).toBe(false)
  })

  it('never matches across two different game ids, even for the identical path', () => {
    const entry = makeEntry({ path: '/mods/shared', gameId: 'stellaris' })

    expect(sameKnownPathOn('darwin', entry, '/mods/shared', 'eu4', 'modFolder')).toBe(false)
  })

  it('never matches across two different kinds, even for the identical path and game', () => {
    const entry = makeEntry({ path: '/paths/shared', gameId: 'stellaris', kind: 'modFolder' })

    expect(sameKnownPathOn('darwin', entry, '/paths/shared', 'stellaris', 'gameInstall')).toBe(
      false
    )
  })
})

describe('addKnownPathEntry', () => {
  it('adds a new entry as unpinned', () => {
    const result = addKnownPathEntry(
      [],
      { path: '/mods/new', gameId: 'stellaris', kind: 'modFolder' },
      '2024-06-01T00:00:00.000Z'
    )

    expect(result).toEqual([
      {
        path: '/mods/new',
        gameId: 'stellaris',
        kind: 'modFolder',
        lastUsedAt: '2024-06-01T00:00:00.000Z',
        pinned: false
      }
    ])
  })

  it('creates a new entry already pinned when requested', () => {
    const result = addKnownPathEntry(
      [],
      { path: '/mods/new', gameId: 'stellaris', kind: 'modFolder', pinned: true },
      '2024-06-01T00:00:00.000Z'
    )

    expect(result).toEqual([
      {
        path: '/mods/new',
        gameId: 'stellaris',
        kind: 'modFolder',
        lastUsedAt: '2024-06-01T00:00:00.000Z',
        pinned: true
      }
    ])
  })

  it('pins an existing unpinned entry in place instead of leaving it unpinned', () => {
    const existing = makeEntry({
      path: '/mods/existing',
      pinned: false,
      lastUsedAt: '2024-01-01T00:00:00.000Z'
    })

    const result = addKnownPathEntry(
      [existing],
      { path: '/mods/existing', gameId: 'stellaris', kind: 'modFolder', pinned: true },
      '2024-06-01T00:00:00.000Z'
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({
      ...existing,
      lastUsedAt: '2024-06-01T00:00:00.000Z',
      pinned: true
    })
  })

  it('leaves an already-pinned entry pinned when a plain add omits pinned', () => {
    const existing = makeEntry({
      path: '/mods/existing',
      pinned: true,
      lastUsedAt: '2024-01-01T00:00:00.000Z'
    })

    const result = addKnownPathEntry(
      [existing],
      { path: '/mods/existing', gameId: 'stellaris', kind: 'modFolder' },
      '2024-06-01T00:00:00.000Z'
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ ...existing, lastUsedAt: '2024-06-01T00:00:00.000Z' })
  })

  it('refreshes lastUsedAt on an existing entry without creating a duplicate', () => {
    const existing = makeEntry({ path: '/mods/existing', lastUsedAt: '2024-01-01T00:00:00.000Z' })

    const result = addKnownPathEntry(
      [existing],
      { path: '/mods/existing', gameId: 'stellaris', kind: 'modFolder' },
      '2024-06-01T00:00:00.000Z'
    )

    expect(result).toHaveLength(1)
    expect(result[0]).toEqual({ ...existing, lastUsedAt: '2024-06-01T00:00:00.000Z' })
  })

  it('deduplicates two paths differing only by case on darwin and win32', () => {
    const existing = makeEntry({ path: '/mods/CaseTest', lastUsedAt: '2024-01-01T00:00:00.000Z' })
    const added = { path: '/MODS/casetest', gameId: 'stellaris', kind: 'modFolder' as const }

    for (const platform of ['darwin', 'win32'] as const) {
      const result = addKnownPathEntryOn(platform, [existing], added, '2024-06-01T00:00:00.000Z')
      expect(result).toHaveLength(1)
      expect(result[0]?.path).toBe('/mods/CaseTest')
      expect(result[0]?.lastUsedAt).toBe('2024-06-01T00:00:00.000Z')
    }
  })

  it('keeps two paths differing only by case distinct on linux', () => {
    const existing = makeEntry({ path: '/mods/CaseTest', lastUsedAt: '2024-01-01T00:00:00.000Z' })

    const result = addKnownPathEntryOn(
      'linux',
      [existing],
      { path: '/mods/casetest', gameId: 'stellaris', kind: 'modFolder' },
      '2024-06-01T00:00:00.000Z'
    )

    expect(result).toHaveLength(2)
  })

  it('purges unpinned entries beyond the cap, oldest first, leaving pinned ones untouched', () => {
    const unpinned = Array.from({ length: 25 }, (_, i) =>
      makeEntry({
        path: `/mods/unpinned-${i}`,
        lastUsedAt: new Date(2024, 0, 1, 0, 0, i).toISOString()
      })
    )

    const result = addKnownPathEntry(
      unpinned,
      { path: '/mods/newest', gameId: 'stellaris', kind: 'modFolder' },
      '2024-06-01T00:00:00.000Z'
    )

    expect(result).toHaveLength(5)
    expect(result.some(entry => entry.path === '/mods/unpinned-0')).toBe(false)
    expect(result.some(entry => entry.path === '/mods/unpinned-24')).toBe(true)
    expect(result.some(entry => entry.path === '/mods/newest')).toBe(true)
  })

  it('keeps a pinned entry even far beyond the cap', () => {
    const pinnedOld = makeEntry({
      path: '/mods/pinned-old',
      pinned: true,
      lastUsedAt: '2000-01-01T00:00:00.000Z'
    })
    const unpinned = Array.from({ length: 25 }, (_, i) =>
      makeEntry({
        path: `/mods/unpinned-${i}`,
        lastUsedAt: new Date(2024, 0, 1, 0, 0, i).toISOString()
      })
    )

    const result = addKnownPathEntry(
      [pinnedOld, ...unpinned],
      { path: '/mods/newest', gameId: 'stellaris', kind: 'modFolder' },
      '2024-06-01T00:00:00.000Z'
    )

    expect(result.some(entry => entry.path === '/mods/pinned-old')).toBe(true)
    expect(result.filter(entry => !entry.pinned)).toHaveLength(5)
  })

  it('does not consume the unpinned recents cap when the new entry is created already pinned', () => {
    const unpinned = Array.from({ length: 5 }, (_, i) =>
      makeEntry({
        path: `/mods/unpinned-${i}`,
        lastUsedAt: new Date(2024, 0, 1, 0, 0, i).toISOString()
      })
    )

    const result = addKnownPathEntry(
      unpinned,
      { path: '/mods/newest-pinned', gameId: 'stellaris', kind: 'modFolder', pinned: true },
      '2024-06-01T00:00:00.000Z'
    )

    expect(result).toHaveLength(6)
    expect(result.filter(entry => !entry.pinned)).toHaveLength(5)
    expect(result.some(entry => entry.path === '/mods/unpinned-0')).toBe(true)
    expect(result.some(entry => entry.path === '/mods/newest-pinned' && entry.pinned)).toBe(true)
  })

  it('does not let a full mod-folder cap evict game-install entries of the same game', () => {
    const modFolders = Array.from({ length: 5 }, (_, i) =>
      makeEntry({
        path: `/mods/modfolder-${i}`,
        kind: 'modFolder',
        lastUsedAt: new Date(2024, 0, 1, 0, 0, i).toISOString()
      })
    )
    const gameInstall = makeEntry({
      path: '/games/stellaris',
      kind: 'gameInstall',
      lastUsedAt: '2024-01-01T00:00:00.000Z'
    })

    const result = addKnownPathEntry(
      [...modFolders, gameInstall],
      { path: '/mods/newest-modfolder', gameId: 'stellaris', kind: 'modFolder' },
      '2024-06-01T00:00:00.000Z'
    )

    expect(result.filter(entry => entry.kind === 'modFolder')).toHaveLength(5)
    expect(result).toContainEqual(gameInstall)
  })

  it('records the same path for the same game under both kinds as two independent entries', () => {
    const forModFolder = addKnownPathEntry(
      [],
      { path: '/shared/path', gameId: 'stellaris', kind: 'modFolder' },
      '2024-01-01T00:00:00.000Z'
    )
    const result = addKnownPathEntry(
      forModFolder,
      { path: '/shared/path', gameId: 'stellaris', kind: 'gameInstall' },
      '2024-06-01T00:00:00.000Z'
    )

    expect(result).toHaveLength(2)
    expect(result.find(e => e.kind === 'modFolder')?.lastUsedAt).toBe('2024-01-01T00:00:00.000Z')
    expect(result.find(e => e.kind === 'gameInstall')?.lastUsedAt).toBe('2024-06-01T00:00:00.000Z')
  })
})

describe('togglePinKnownPathEntry', () => {
  it('flips the pinned flag on the matching entry only', () => {
    const target = makeEntry({ path: '/mods/target', pinned: false })
    const other = makeEntry({ path: '/mods/other', pinned: false })

    const result = togglePinKnownPathEntry(
      [target, other],
      '/mods/target',
      'stellaris',
      'modFolder'
    )

    expect(result).toEqual([{ ...target, pinned: true }, other])
  })

  it('does not pin the game-install entry of the same path and game', () => {
    const modFolder = makeEntry({ path: '/shared/path', kind: 'modFolder', pinned: false })
    const gameInstall = makeEntry({ path: '/shared/path', kind: 'gameInstall', pinned: false })

    const result = togglePinKnownPathEntry(
      [modFolder, gameInstall],
      '/shared/path',
      'stellaris',
      'modFolder'
    )

    expect(result).toEqual([{ ...modFolder, pinned: true }, gameInstall])
  })
})

describe('removeKnownPathEntry', () => {
  it('removes the matching entry and keeps the rest', () => {
    const target = makeEntry({ path: '/mods/target' })
    const other = makeEntry({ path: '/mods/other' })

    const result = removeKnownPathEntry([target, other], '/mods/target', 'stellaris', 'modFolder')

    expect(result).toEqual([other])
  })

  it('does not remove the game-install entry of the same path and game', () => {
    const modFolder = makeEntry({ path: '/shared/path', kind: 'modFolder' })
    const gameInstall = makeEntry({ path: '/shared/path', kind: 'gameInstall' })

    const result = removeKnownPathEntry(
      [modFolder, gameInstall],
      '/shared/path',
      'stellaris',
      'modFolder'
    )

    expect(result).toEqual([gameInstall])
  })
})

describe('clearKnownPathEntries', () => {
  it('removes the unpinned entries of the given game and kind and keeps the pinned one', () => {
    const pinned = makeEntry({ path: '/mods/pinned', pinned: true })
    const recent1 = makeEntry({ path: '/mods/recent1' })
    const recent2 = makeEntry({ path: '/mods/recent2' })

    const result = clearKnownPathEntries([pinned, recent1, recent2], 'stellaris', 'modFolder')

    expect(result).toEqual([pinned])
  })

  it('leaves entries of other games untouched, pinned and unpinned alike', () => {
    const stellarisRecent = makeEntry({ path: '/mods/stellaris-recent' })
    const eu4Pinned = makeEntry({ path: '/mods/eu4-pinned', gameId: 'eu4', pinned: true })
    const eu4Recent = makeEntry({ path: '/mods/eu4-recent', gameId: 'eu4' })

    const result = clearKnownPathEntries(
      [stellarisRecent, eu4Pinned, eu4Recent],
      'stellaris',
      'modFolder'
    )

    expect(result).toEqual([eu4Pinned, eu4Recent])
  })

  it('leaves the game-install entries of the same game untouched when clearing mod folders', () => {
    const modFolderRecent = makeEntry({ path: '/mods/recent', kind: 'modFolder' })
    const gameInstallRecent = makeEntry({ path: '/games/recent', kind: 'gameInstall' })

    const result = clearKnownPathEntries(
      [modFolderRecent, gameInstallRecent],
      'stellaris',
      'modFolder'
    )

    expect(result).toEqual([gameInstallRecent])
  })

  it('returns an empty array when given an empty list', () => {
    expect(clearKnownPathEntries([], 'stellaris', 'modFolder')).toEqual([])
  })

  it('leaves the list unchanged in content when the game has no entries at all', () => {
    const eu4Recent = makeEntry({ path: '/mods/eu4-recent', gameId: 'eu4' })
    const eu4Pinned = makeEntry({ path: '/mods/eu4-pinned', gameId: 'eu4', pinned: true })

    const result = clearKnownPathEntries([eu4Recent, eu4Pinned], 'stellaris', 'modFolder')

    expect(result).toEqual([eu4Recent, eu4Pinned])
  })
})

describe('pruneKnownPaths', () => {
  const makeAged = (overrides: Partial<KnownPathEntry> & { day: number }): KnownPathEntry =>
    makeEntry({
      ...overrides,
      lastUsedAt: `2024-01-${String(overrides.day).padStart(2, '0')}T00:00:00.000Z`
    })

  it('is a no-op when nothing exceeds the cap', () => {
    const entries = [makeEntry({ path: '/mods/a' }), makeEntry({ path: '/mods/b', pinned: true })]

    expect(pruneKnownPaths(entries)).toEqual(entries)
  })

  it('caps each game independently when both exceed the cap', () => {
    const stellaris = Array.from({ length: 7 }, (_, i) =>
      makeAged({ path: `/mods/stellaris-${i}`, gameId: 'stellaris', day: i + 1 })
    )
    const eu4 = Array.from({ length: 6 }, (_, i) =>
      makeAged({ path: `/mods/eu4-${i}`, gameId: 'eu4', day: i + 1 })
    )

    const result = pruneKnownPaths([...stellaris, ...eu4])

    expect(result.filter(e => e.gameId === 'stellaris')).toHaveLength(5)
    expect(result.filter(e => e.gameId === 'eu4')).toHaveLength(5)
  })

  it('does not evict another game entries when one game is far over the cap', () => {
    const stellaris = Array.from({ length: 12 }, (_, i) =>
      makeAged({ path: `/mods/stellaris-${i}`, gameId: 'stellaris', day: i + 1 })
    )
    const hoi4Entry = makeAged({ path: '/mods/hoi4-only', gameId: 'hoi4', day: 1 })

    const result = pruneKnownPaths([...stellaris, hoi4Entry])

    expect(result.filter(e => e.gameId === 'stellaris')).toHaveLength(5)
    expect(result).toContainEqual(hoi4Entry)
  })

  it('drops the oldest unpinned entries of a game first, keeping its pinned entries regardless of count', () => {
    const pinned = Array.from({ length: 5 }, (_, i) =>
      makeAged({ path: `/mods/pinned-${i}`, gameId: 'stellaris', pinned: true, day: i + 1 })
    )
    const unpinned = Array.from({ length: 7 }, (_, i) =>
      makeAged({ path: `/mods/unpinned-${i}`, gameId: 'stellaris', day: i + 6 })
    )

    const result = pruneKnownPaths([...pinned, ...unpinned])

    expect(result.filter(e => e.pinned)).toHaveLength(5)
    expect(result.filter(e => e.pinned)).toEqual(pinned)
    expect(result.filter(e => !e.pinned)).toHaveLength(5)
    expect(result).not.toContainEqual(unpinned[0])
    expect(result).not.toContainEqual(unpinned[1])
  })

  it('preserves the relative order of surviving entries rather than re-sorting the whole list', () => {
    const first = makeAged({ path: '/mods/first', gameId: 'stellaris', day: 10 })
    const second = makeAged({ path: '/mods/second', gameId: 'eu4', day: 5 })
    const third = makeAged({ path: '/mods/third', gameId: 'stellaris', day: 15 })

    const result = pruneKnownPaths([first, second, third])

    expect(result).toEqual([first, second, third])
  })

  it('returns an empty array when given an empty list', () => {
    expect(pruneKnownPaths([])).toEqual([])
  })

  it('caps mod folders and game installs of the same game independently, one full kind never evicting the other', () => {
    const modFolders = Array.from({ length: 8 }, (_, i) =>
      makeAged({ path: `/mods/modfolder-${i}`, gameId: 'stellaris', kind: 'modFolder', day: i + 1 })
    )
    const gameInstalls = Array.from({ length: 3 }, (_, i) =>
      makeAged({
        path: `/games/gameinstall-${i}`,
        gameId: 'stellaris',
        kind: 'gameInstall',
        day: i + 1
      })
    )

    const result = pruneKnownPaths([...modFolders, ...gameInstalls])

    expect(result.filter(e => e.kind === 'modFolder')).toHaveLength(5)
    expect(result.filter(e => e.kind === 'gameInstall')).toHaveLength(3)
  })
})

describe('per-game isolation of knownPaths', () => {
  it('records the same path for two different games as two independent entries', () => {
    let entries = addKnownPathEntry(
      [],
      { path: '/mods/shared', gameId: 'stellaris', kind: 'modFolder' },
      '2024-01-01T00:00:00.000Z'
    )
    entries = addKnownPathEntry(
      entries,
      { path: '/mods/shared', gameId: 'eu4', kind: 'modFolder' },
      '2024-06-01T00:00:00.000Z'
    )

    expect(entries).toHaveLength(2)
    expect(entries.find(e => e.gameId === 'stellaris')?.lastUsedAt).toBe('2024-01-01T00:00:00.000Z')
    expect(entries.find(e => e.gameId === 'eu4')?.lastUsedAt).toBe('2024-06-01T00:00:00.000Z')
  })

  it('pinning the entry for one game does not affect the other game', () => {
    let entries = addKnownPathEntry(
      [],
      { path: '/mods/shared', gameId: 'stellaris', kind: 'modFolder' },
      '2024-01-01T00:00:00.000Z'
    )
    entries = addKnownPathEntry(
      entries,
      { path: '/mods/shared', gameId: 'eu4', kind: 'modFolder' },
      '2024-01-01T00:00:00.000Z'
    )

    entries = togglePinKnownPathEntry(entries, '/mods/shared', 'stellaris', 'modFolder')

    expect(entries.find(e => e.gameId === 'stellaris')?.pinned).toBe(true)
    expect(entries.find(e => e.gameId === 'eu4')?.pinned).toBe(false)
  })

  it('removing the entry for one game leaves the other game entry in place', () => {
    let entries = addKnownPathEntry(
      [],
      { path: '/mods/shared', gameId: 'stellaris', kind: 'modFolder' },
      '2024-01-01T00:00:00.000Z'
    )
    entries = addKnownPathEntry(
      entries,
      { path: '/mods/shared', gameId: 'eu4', kind: 'modFolder' },
      '2024-01-01T00:00:00.000Z'
    )

    entries = removeKnownPathEntry(entries, '/mods/shared', 'stellaris', 'modFolder')

    expect(entries).toHaveLength(1)
    expect(entries[0]?.gameId).toBe('eu4')
  })
})

const makeValidRawState = (overrides: Partial<SettingsSchema> = {}): SettingsSchema => ({
  ...DEFAULTS,
  targetLanguages: { stellaris: ['fr'] },
  lastGameId: 'stellaris',
  knownPaths: [makeEntry({ path: '/mods/kept' })],
  ...overrides
})

const asStoredState = (value: unknown): SettingsSchema => JSON.parse(JSON.stringify(value))

describe('reconcileSettingsState', () => {
  it('leaves every field untouched when the whole state is already valid', () => {
    const raw = makeValidRawState()

    const result = reconcileSettingsState(raw)

    expect(result.changed).toBe(false)
    expect(result.repaired).toEqual(raw)
    expect(result.logs).toEqual([])
  })

  it('resets a single field of the wrong type to its default without touching the rest', () => {
    const raw = asStoredState({ ...makeValidRawState(), autoCheckUpdates: 'yes' })

    const result = reconcileSettingsState(raw)

    expect(result.changed).toBe(true)
    expect(result.repaired.autoCheckUpdates).toBe(DEFAULTS.autoCheckUpdates)
    expect(result.repaired.targetLanguages).toEqual(raw.targetLanguages)
    expect(result.repaired.lastGameId).toBe(raw.lastGameId)
    expect(result.repaired.knownPaths).toEqual(raw.knownPaths)
    expect(result.logs.some(l => l.includes('autoCheckUpdates'))).toBe(true)
  })

  it('repairs knownPaths entry by entry, leaving every other field alone', () => {
    const good = makeEntry({ path: '/mods/good' })
    const bad: KnownPathEntry = {
      path: '/mods/bad',
      gameId: 'stellaris',
      kind: 'modFolder',
      lastUsedAt: 'not-iso',
      pinned: false
    }
    const raw = makeValidRawState({ knownPaths: [good, bad] })

    const result = reconcileSettingsState(raw)

    expect(result.changed).toBe(true)
    expect(result.repaired.knownPaths).toEqual([good])
    expect(result.repaired.targetLanguages).toEqual(raw.targetLanguages)
    expect(result.repaired.lastGameId).toBe(raw.lastGameId)
    expect(result.repaired.autoCheckUpdates).toBe(raw.autoCheckUpdates)
    expect(result.logs.some(l => l.includes('dropped 1 invalid entry'))).toBe(true)
  })

  it('resets knownPaths to an empty array when it is not an array at all, leaving every other field alone', () => {
    const raw = asStoredState({ ...makeValidRawState(), knownPaths: 'not-an-array' })

    const result = reconcileSettingsState(raw)

    expect(result.changed).toBe(true)
    expect(result.repaired.knownPaths).toEqual([])
    expect(result.repaired.targetLanguages).toEqual(raw.targetLanguages)
    expect(result.repaired.lastGameId).toBe(raw.lastGameId)
    expect(result.repaired.autoCheckUpdates).toBe(raw.autoCheckUpdates)
  })

  it('merges pre-existing duplicate knownPaths and reports the merge in the logs', () => {
    const dup = makeEntry({ path: '/mods/dup' })
    const raw = makeValidRawState({ knownPaths: [dup, { ...dup }] })

    const result = reconcileSettingsState(raw)

    expect(result.changed).toBe(true)
    expect(result.repaired.knownPaths).toEqual([dup])
    expect(result.logs.some(l => l.includes('merged 1 duplicate entry'))).toBe(true)
  })

  it('caps a pre-existing knownPaths list larger than the new per-game limit on startup', () => {
    const stale = Array.from({ length: 20 }, (_, i) =>
      makeEntry({
        path: `/mods/stale-${i}`,
        lastUsedAt: `2024-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`
      })
    )
    const raw = makeValidRawState({ knownPaths: stale })

    const result = reconcileSettingsState(raw)

    expect(result.changed).toBe(true)
    expect(result.repaired.knownPaths).toHaveLength(5)
    expect(
      result.logs.some(l => l.includes('capped 15 entries over the per-game recent limit'))
    ).toBe(true)
  })

  it('migrates every pre-existing knownPaths entry stored without a kind field to modFolder, keeping them all', () => {
    const legacyEntries = Array.from({ length: 3 }, (_, i) => ({
      path: `/mods/legacy-${i}`,
      gameId: 'stellaris',
      lastUsedAt: `2024-01-0${i + 1}T00:00:00.000Z`,
      pinned: i === 0
    }))
    const raw = asStoredState({ ...makeValidRawState(), knownPaths: legacyEntries })

    const result = reconcileSettingsState(raw)

    expect(result.changed).toBe(true)
    expect(result.repaired.knownPaths).toHaveLength(3)
    expect(result.repaired.knownPaths.every(entry => entry.kind === 'modFolder')).toBe(true)
    expect(result.logs.some(l => l.includes('migrated 3 entries'))).toBe(true)
  })
})

describe('persisted translate settings', () => {
  it('ships a default block, so a fresh profile has a provider to start from', () => {
    expect(DEFAULTS.translate.provider).toBe(TRANSLATE_DEFAULTS.provider)
    expect(DEFAULTS.translate.batchSize).toBe(TRANSLATE_DEFAULTS.batchSize)
    expect(DEFAULTS.translate.backends).toEqual({})
  })

  it('keeps an endpoint per provider, which is what survives a backend switch', () => {
    const raw = makeValidRawState({
      translate: {
        ...DEFAULTS.translate,
        provider: 'openai',
        backends: {
          openai: { baseUrl: 'http://localhost:1234/v1', model: 'qwen3-8b' },
          ollama: { baseUrl: 'http://localhost:11434', model: 'qwen2.5:7b' }
        }
      }
    })

    const result = reconcileSettingsState(raw)

    expect(result.changed).toBe(false)
    expect(result.repaired.translate.backends.openai?.model).toBe('qwen3-8b')
    expect(result.repaired.translate.backends.ollama?.model).toBe('qwen2.5:7b')
  })

  it('resets a batch size a hand-edited file pushed past the limit', () => {
    const raw = asStoredState({
      ...makeValidRawState(),
      translate: { ...DEFAULTS.translate, batchSize: 10_000 }
    })

    const result = reconcileSettingsState(raw)

    expect(result.changed).toBe(true)
    expect(result.repaired.translate).toEqual(DEFAULTS.translate)
    expect(result.logs.some(l => l.includes('translate'))).toBe(true)
  })

  it('resets an unknown provider rather than starting on a backend that does not exist', () => {
    const raw = asStoredState({
      ...makeValidRawState(),
      translate: { ...DEFAULTS.translate, provider: 'deepl' }
    })

    const result = reconcileSettingsState(raw)

    expect(result.changed).toBe(true)
    expect(result.repaired.translate.provider).toBe(DEFAULTS.translate.provider)
  })

  it('never stores an API key, whatever the UI holds', () => {
    expect(JSON.stringify(DEFAULTS)).not.toContain('apiKey')
  })
})
