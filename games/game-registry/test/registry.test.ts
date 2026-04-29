import { describe, expect, it } from 'vitest'

import { LANGUAGE_CODES } from '@ptt/shared-types'

import {
  ck3,
  eu4,
  eu5,
  getAllGameIds,
  getAllGames,
  getGame,
  getGameSummaries,
  hoi4,
  imperator,
  stellaris,
  toGameSummary,
  vic3
} from '../src/index.js'

describe('getAllGames', () => {
  it('returns all seven built-in games', () => {
    const all = getAllGames()
    expect(all).toHaveLength(7)
    const ids = all.map(g => g.id).toSorted()
    expect(ids).toEqual(['ck3', 'eu4', 'eu5', 'hoi4', 'imperator', 'stellaris', 'vic3'])
  })

  it('returns the same singleton instances as the per-game packages', () => {
    const all = getAllGames()
    expect(all).toContain(stellaris)
    expect(all).toContain(eu4)
    expect(all).toContain(eu5)
    expect(all).toContain(hoi4)
    expect(all).toContain(ck3)
    expect(all).toContain(vic3)
    expect(all).toContain(imperator)
  })
})

describe('getGame', () => {
  it('finds a game by id', () => {
    expect(getGame('stellaris')).toBe(stellaris)
    expect(getGame('ck3')).toBe(ck3)
  })

  it('returns undefined for an unknown id', () => {
    expect(getGame('victoria-2')).toBeUndefined()
  })
})

describe('getGameSummaries', () => {
  it('returns one summary per built-in game', () => {
    const summaries = getGameSummaries()
    expect(summaries).toHaveLength(7)
  })

  it('exposes the language list from the GameDefinition', () => {
    const summary = toGameSummary(stellaris)
    expect(summary.languages).toContain('en')
    expect(summary.languages).toContain('zh-Hans')
  })

  it('includes the Steam App ID when present', () => {
    const summary = toGameSummary(stellaris)
    expect(summary.steamAppId).toBe(281990)
  })

  it('omits the Steam App ID when absent', () => {
    const { steamAppId: _ignored, ...rest } = stellaris
    const summary = toGameSummary(rest)
    expect('steamAppId' in summary).toBe(false)
  })
})

describe('getAllGameIds', () => {
  it('returns the registered ids as a non-empty tuple', () => {
    const ids = getAllGameIds()
    expect(ids.length).toBeGreaterThan(0)
    expect(ids.toSorted()).toEqual(
      getAllGames()
        .map(g => g.id)
        .toSorted()
    )
  })
})

describe('language coverage invariant', () => {
  it('every registered game uses only LanguageCodes from shared-types', () => {
    const known = new Set<string>(LANGUAGE_CODES)
    for (const game of getAllGames()) {
      const declared = Object.keys(game.languageFileToken)
      const unknown = declared.filter(k => !known.has(k))
      expect(unknown, `${game.id} references unknown language codes`).toEqual([])
    }
  })
})

describe('extensibility', () => {
  it('allows adding a new game via spread without registry changes', () => {
    // This is the contract: a downstream user can wrap the registry and add
    // a new game without touching this package - proving the architecture's extensibility.
    const fakeGame = {
      id: 'victoria-2',
      displayName: 'Victoria 2',
      steamAppId: 42960,
      localisationDirName: 'localisation' as const,
      layout: 'both' as const,
      languageFileToken: { en: 'english', fr: 'french' },
      overrideSubdirs: ['replace']
    }
    const extendedRegistry = [...getAllGames(), fakeGame]
    expect(extendedRegistry).toHaveLength(8)
    expect(extendedRegistry.find(g => g.id === 'victoria-2')).toBe(fakeGame)
  })
})
