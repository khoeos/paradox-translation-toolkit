import { ck3 } from '@ptt/game-ck3'
import { eu4 } from '@ptt/game-eu4'
import { eu5 } from '@ptt/game-eu5'
import { hoi4 } from '@ptt/game-hoi4'
import { imperator } from '@ptt/game-imperator'
import { stellaris } from '@ptt/game-stellaris'
import { vic3 } from '@ptt/game-vic3'
import type { GameDefinition, GameSummary, LanguageCode } from '@ptt/shared-types'

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
