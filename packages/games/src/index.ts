import type { GameDefinition, GameSummary, LanguageCode } from '@ptt/shared'

import { ck3 } from './ck3.js'
import { eu4 } from './eu4.js'
import { eu5 } from './eu5.js'
import { hoi4 } from './hoi4.js'
import { imperator } from './imperator.js'
import { stellaris } from './stellaris.js'
import { vic3 } from './vic3.js'

const builtInGames: readonly GameDefinition[] = [stellaris, eu4, eu5, hoi4, ck3, vic3, imperator]

export function getAllGames(): readonly GameDefinition[] {
  return builtInGames
}

export function getGame(id: string): GameDefinition | undefined {
  return builtInGames.find(g => g.id === id)
}

/** Returns the registered game ids as a non-empty tuple for `z.enum(...)`. */
export function getAllGameIds(): [string, ...string[]] {
  const ids = builtInGames.map(g => g.id)
  if (ids.length === 0) {
    throw new Error('Game registry is empty, at least one game must be registered')
  }
  return ids as [string, ...string[]]
}

export function toGameSummary(game: GameDefinition): GameSummary {
  return {
    id: game.id,
    displayName: game.displayName,
    ...(game.steamAppId !== undefined && { steamAppId: game.steamAppId }),
    languages: Object.keys(game.languageFileToken) as LanguageCode[]
  }
}

export function getGameSummaries(): GameSummary[] {
  return builtInGames.map(toGameSummary)
}

export { stellaris, eu4, hoi4, ck3, eu5, vic3, imperator }
