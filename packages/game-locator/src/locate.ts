/// <reference lib="dom" />

import { posixJoin, resolveGeneratedMod } from '@ptt/converter'
import type { FsLike, GameDefinition, RegistryLike } from '@ptt/shared'

import { findGogInstall } from './gog.js'
import { expandGameDataPath, readLauncherSettings, resolveExecutablePath } from './launcher-settings.js'
import type { LauncherSettings } from './launcher-settings.js'
import type { Platform } from './platform.js'
import { findGameInstallDir, findLibraryFolders, findSteamRoot, findWorkshopContentDir } from './steam.js'

export const LOCATE_SOURCE_TIMEOUT_MS = 6_000

const withTimeout = async <T>(operation: Promise<T>, fallback: T, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<T>(resolve => {
    timer = setTimeout(() => resolve(fallback), timeoutMs)
  })
  try {
    return await Promise.race([operation, timeout])
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer)
    }
  }
}

export interface LocatedPaths {
  installDir?: string
  workshopContentPaths: string[]
  userModsFolder?: string
  gogInstall?: string
  steamLibraries: string[]
  declaredGameId?: string
  executablePath?: string
}

export const locateGamePaths = async (
  game: Pick<GameDefinition, 'id' | 'userFolder' | 'steamAppId'>,
  platform: Platform,
  home: string,
  documentsPath: string,
  fs: FsLike,
  registry: RegistryLike,
  sourceTimeoutMs: number = LOCATE_SOURCE_TIMEOUT_MS
): Promise<LocatedPaths> => {
  const fallbackUserModsFolder = resolveUserModsFolder(documentsPath, game)

  const steamLibraries = await findSteamRootLibraries(platform, home, fs, registry, sourceTimeoutMs)

  let installDir: string | undefined
  let workshopContentPaths: string[] = []
  if (game.steamAppId !== undefined) {
    installDir = await tryFindGameInstallDir(steamLibraries, game.steamAppId, fs, sourceTimeoutMs)
    workshopContentPaths = await tryFindWorkshopContentDir(steamLibraries, game.steamAppId, fs, sourceTimeoutMs)
  }

  const gogInstall = await tryFindGogInstall(game.id, platform, registry, sourceTimeoutMs)

  const launcherSettings =
    installDir !== undefined ? await tryReadLauncherSettings(installDir, fs, sourceTimeoutMs) : undefined

  const localDataHome = posixJoin(home, '.local', 'share')
  const expandedGameDataPath =
    launcherSettings?.gameDataPath !== undefined
      ? expandGameDataPath(launcherSettings.gameDataPath, home, documentsPath, localDataHome)
      : undefined
  const userModsFolderCandidate =
    expandedGameDataPath !== undefined ? posixJoin(expandedGameDataPath, 'mod') : fallbackUserModsFolder
  const userModsFolder = (await directoryExists(userModsFolderCandidate, fs, sourceTimeoutMs))
    ? userModsFolderCandidate
    : undefined

  const executablePath =
    installDir !== undefined && launcherSettings?.exePath !== undefined
      ? await tryResolveExecutablePath(installDir, launcherSettings.exePath, fs, sourceTimeoutMs)
      : undefined

  return {
    ...(installDir !== undefined && { installDir }),
    workshopContentPaths,
    ...(userModsFolder !== undefined && { userModsFolder }),
    ...(gogInstall !== undefined && { gogInstall }),
    steamLibraries,
    ...(launcherSettings?.gameId !== undefined && { declaredGameId: launcherSettings.gameId }),
    ...(executablePath !== undefined && { executablePath })
  }
}

const findSteamRootLibraries = async (
  platform: Platform,
  home: string,
  fs: FsLike,
  registry: RegistryLike,
  timeoutMs: number
): Promise<string[]> => {
  return withTimeout(
    (async () => {
      try {
        const steamRoot = await findSteamRoot(platform, home, fs, registry)
        if (steamRoot === undefined) {
          return []
        }
        return await findLibraryFolders(steamRoot, fs)
      } catch {
        return []
      }
    })(),
    [],
    timeoutMs
  )
}

const tryFindGameInstallDir = async (
  libraries: readonly string[],
  appId: number,
  fs: FsLike,
  timeoutMs: number
): Promise<string | undefined> => {
  return withTimeout(
    (async () => {
      try {
        return await findGameInstallDir(libraries, appId, fs)
      } catch {
        return undefined
      }
    })(),
    undefined,
    timeoutMs
  )
}

const tryFindWorkshopContentDir = async (
  libraries: readonly string[],
  appId: number,
  fs: FsLike,
  timeoutMs: number
): Promise<string[]> => {
  return withTimeout(
    (async () => {
      try {
        return await findWorkshopContentDir(libraries, appId, fs)
      } catch {
        return []
      }
    })(),
    [],
    timeoutMs
  )
}

const tryFindGogInstall = async (
  gameId: string,
  platform: Platform,
  registry: RegistryLike,
  timeoutMs: number
): Promise<string | undefined> => {
  return withTimeout(
    (async () => {
      try {
        return await findGogInstall(gameId, platform, registry)
      } catch {
        return undefined
      }
    })(),
    undefined,
    timeoutMs
  )
}

const tryReadLauncherSettings = async (
  installDir: string,
  fs: FsLike,
  timeoutMs: number
): Promise<LauncherSettings | undefined> => {
  return withTimeout(
    (async () => {
      try {
        return await readLauncherSettings(installDir, fs)
      } catch {
        return undefined
      }
    })(),
    undefined,
    timeoutMs
  )
}

const tryResolveExecutablePath = async (
  installDir: string,
  exePath: string,
  fs: FsLike,
  timeoutMs: number
): Promise<string | undefined> => {
  const candidate = resolveExecutablePath(installDir, exePath)
  return withTimeout(
    (async () => {
      try {
        return (await fs.exists(candidate)) ? candidate : undefined
      } catch {
        return undefined
      }
    })(),
    undefined,
    timeoutMs
  )
}

const directoryExists = async (path: string, fs: FsLike, timeoutMs: number): Promise<boolean> => {
  if (path.trim().length === 0) return false
  return withTimeout(
    (async () => {
      try {
        const stats = await fs.stat(path)
        return stats.isDirectory
      } catch {
        return false
      }
    })(),
    false,
    timeoutMs
  )
}

const resolveUserModsFolder = (
  documentsPath: string,
  game: Pick<GameDefinition, 'id' | 'userFolder' | 'steamAppId'>
): string => {
  try {
    return resolveGeneratedMod(documentsPath, game).modsDir
  } catch {
    return ''
  }
}
