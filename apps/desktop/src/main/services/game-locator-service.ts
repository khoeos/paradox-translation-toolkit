import { app } from 'electron'

import { nodeFs, nodeParadoxDataHome, nodeRegistry } from '@ptt/fs-node'
import { locateGamePaths, toPlatform, type LocatedPaths, type Platform } from '@ptt/game-locator'
import { getGame } from '@ptt/games'
import type { FsLike, GameDefinition, RegistryLike } from '@ptt/shared'

import { isCriticalFolder } from './path-policy.js'

export type LocateGamePathsFn = (
  game: Pick<GameDefinition, 'id' | 'userFolder' | 'steamAppId'>,
  platform: Platform,
  home: string,
  documentsPath: string,
  fs: FsLike,
  registry: RegistryLike
) => Promise<LocatedPaths>

export type SafeLocatedPaths = LocatedPaths

export class GameLocatorService {
  constructor(
    private readonly home: string,
    private readonly documentsPath: string | undefined,
    private readonly fs: FsLike,
    private readonly registry: RegistryLike,
    private readonly locate: LocateGamePathsFn = locateGamePaths
  ) {}

  async locateGame(gameId: string): Promise<SafeLocatedPaths> {
    const game = getGame(gameId)
    if (!game) throw new Error(`Unknown game id: ${gameId}`)
    if (this.documentsPath === undefined) throw new Error('Documents folder is not available')

    const platform = toPlatform(process.platform)
    const paths = await this.locate(
      game,
      platform,
      this.home,
      this.documentsPath,
      this.fs,
      this.registry
    )
    return filterCriticalPaths(paths)
  }
}

function filterCriticalPaths(paths: LocatedPaths): SafeLocatedPaths {
  const handled = {
    installDir: paths.installDir,
    workshopContentPaths: paths.workshopContentPaths,
    userModsFolder: paths.userModsFolder,
    gogInstall: paths.gogInstall,
    steamLibraries: paths.steamLibraries,
    declaredGameId: paths.declaredGameId,
    executablePath: paths.executablePath
  } satisfies Record<keyof LocatedPaths, unknown>

  const safe: SafeLocatedPaths = {
    workshopContentPaths: handled.workshopContentPaths.filter(path => !isCriticalFolder(path)),
    steamLibraries: handled.steamLibraries.filter(path => !isCriticalFolder(path))
  }
  if (handled.installDir !== undefined && !isCriticalFolder(handled.installDir)) {
    safe.installDir = handled.installDir
  }
  if (handled.userModsFolder !== undefined && !isCriticalFolder(handled.userModsFolder)) {
    safe.userModsFolder = handled.userModsFolder
  }
  if (handled.gogInstall !== undefined && !isCriticalFolder(handled.gogInstall)) {
    safe.gogInstall = handled.gogInstall
  }
  if (handled.declaredGameId !== undefined) {
    safe.declaredGameId = handled.declaredGameId
  }
  if (handled.executablePath !== undefined && !isCriticalFolder(handled.executablePath)) {
    safe.executablePath = handled.executablePath
  }
  return safe
}

function resolveDocumentsPath(): string | undefined {
  try {
    return nodeParadoxDataHome(app.getPath('documents'))
  } catch {
    return undefined
  }
}

export function createGameLocatorService(): GameLocatorService {
  return new GameLocatorService(app.getPath('home'), resolveDocumentsPath(), nodeFs, nodeRegistry)
}
