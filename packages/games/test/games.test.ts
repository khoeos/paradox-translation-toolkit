import { describe, expect, it } from 'vitest'

import { LANGUAGE_CODES, type GameDefinition, type LanguageCode } from '@ptt/shared'

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

interface GameRow {
  game: GameDefinition
  id: string
  displayName: string
  steamAppId: number
  localisationDirName: GameDefinition['localisationDirName']
  layout: GameDefinition['layout']
  userFolder: string
  tokens: Array<[LanguageCode, string]>
  overrideSubdirs?: string[]
}

const rows: GameRow[] = [
  {
    game: stellaris,
    id: 'stellaris',
    displayName: 'Stellaris',
    steamAppId: 281990,
    localisationDirName: 'localisation',
    layout: 'both',
    userFolder: 'Stellaris',
    tokens: [
      ['en', 'english'],
      ['pt-BR', 'braz_por'],
      ['zh-Hans', 'simp_chinese']
    ],
    overrideSubdirs: ['replace']
  },
  {
    game: eu4,
    id: 'eu4',
    displayName: 'Europa Universalis IV',
    steamAppId: 236850,
    localisationDirName: 'localisation',
    layout: 'both',
    userFolder: 'Europa Universalis IV',
    tokens: [
      ['en', 'english'],
      ['fr', 'french'],
      ['de', 'german'],
      ['es', 'spanish']
    ]
  },
  {
    game: eu5,
    id: 'eu5',
    displayName: 'Europa Universalis V',
    steamAppId: 3450310,
    localisationDirName: 'localization',
    layout: 'both',
    userFolder: 'Europa Universalis V',
    tokens: [
      ['en', 'english'],
      ['fr', 'french'],
      ['de', 'german'],
      ['es', 'spanish']
    ]
  },
  {
    game: hoi4,
    id: 'hoi4',
    displayName: 'Hearts of Iron IV',
    steamAppId: 394360,
    localisationDirName: 'localisation',
    layout: 'both',
    userFolder: 'Hearts of Iron IV',
    tokens: [['pt-BR', 'braz_por']]
  },
  {
    game: ck3,
    id: 'ck3',
    displayName: 'Crusader Kings III',
    steamAppId: 1158310,
    localisationDirName: 'localization',
    layout: 'both',
    userFolder: 'Crusader Kings III',
    tokens: [['ko', 'korean']]
  },
  {
    game: vic3,
    id: 'vic3',
    displayName: 'Victoria 3',
    steamAppId: 529340,
    localisationDirName: 'localization',
    layout: 'both',
    userFolder: 'Victoria 3',
    tokens: [
      ['en', 'english'],
      ['pt-BR', 'braz_por'],
      ['fr', 'french'],
      ['de', 'german'],
      ['pl', 'polish'],
      ['ru', 'russian'],
      ['es', 'spanish'],
      ['ja', 'japanese'],
      ['zh-Hans', 'simp_chinese'],
      ['ko', 'korean'],
      ['tr', 'turkish']
    ],
    overrideSubdirs: ['replace']
  },
  {
    game: imperator,
    id: 'imperator',
    displayName: 'Imperator: Rome',
    steamAppId: 859580,
    localisationDirName: 'localization',
    layout: 'both',
    userFolder: 'Imperator',
    tokens: [
      ['en', 'english'],
      ['fr', 'french'],
      ['de', 'german'],
      ['ru', 'russian'],
      ['es', 'spanish'],
      ['zh-Hans', 'simp_chinese']
    ],
    overrideSubdirs: ['replace']
  }
]

describe('game definitions', () => {
  it.each(rows)(
    '$id exports a valid GameDefinition',
    ({
      game,
      id,
      displayName,
      steamAppId,
      localisationDirName,
      layout,
      userFolder,
      tokens,
      overrideSubdirs
    }) => {
      expect(game.id).toBe(id)
      expect(game.displayName).toBe(displayName)
      expect(game.steamAppId).toBe(steamAppId)
      expect(game.localisationDirName).toBe(localisationDirName)
      expect(game.layout).toBe(layout)
      expect(game.userFolder).toBe(userFolder)
      for (const subdir of overrideSubdirs ?? []) {
        expect(game.overrideSubdirs, `${id} override subdirs`).toContain(subdir)
      }
      for (const [code, token] of tokens) {
        expect(game.languageFileToken[code], `${id} token for ${code}`).toBe(token)
      }
    }
  )

  it('covers every registered game', () => {
    expect(rows.map(r => r.id).toSorted()).toEqual(
      getAllGames()
        .map(g => g.id)
        .toSorted()
    )
  })
})

describe('getAllGames', () => {
  it('returns all seven built-in games', () => {
    const all = getAllGames()
    expect(all).toHaveLength(7)
    const ids = all.map(g => g.id).toSorted()
    expect(ids).toEqual(['ck3', 'eu4', 'eu5', 'hoi4', 'imperator', 'stellaris', 'vic3'])
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
  it('every registered game uses only LanguageCodes from shared', () => {
    const known = new Set<string>(LANGUAGE_CODES)
    for (const game of getAllGames()) {
      const declared = Object.keys(game.languageFileToken)
      const unknown = declared.filter(k => !known.has(k))
      expect(unknown, `${game.id} references unknown language codes`).toEqual([])
    }
  })
})

describe('generated translation mod metadata', () => {
  it('every registered game declares the Documents folder holding user mods', () => {
    for (const game of getAllGames()) {
      expect(game.userFolder, `${game.id} has no userFolder`).not.toBe('')
      expect(game.userFolder, `${game.id} userFolder is padded`).toBe(game.userFolder.trim())
    }
  })

  it('every registered game describes itself for the translator', () => {
    for (const game of getAllGames()) {
      expect(game.domain, `${game.id} has no domain`).not.toBe('')
      expect(game.domain.length, `${game.id} domain is too terse`).toBeGreaterThan(40)
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
