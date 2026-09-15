import { posixJoin, posixNormalize } from '@ptt/converter'
import type { FsLike } from '@ptt/shared'

const MAX_LAUNCHER_SETTINGS_UTF16_LENGTH = 262_144

const LAUNCHER_SETTINGS_LOCATIONS: readonly string[][] = [
  ['launcher-settings.json'],
  ['launcher', 'launcher-settings.json']
]

const UNRESOLVED_TOKEN_PATTERN = /\$[A-Z_]+|%[A-Z_]+%/

export interface LauncherSettings {
  gameId?: string
  gameDataPath?: string
  exePath?: string
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

export const parseLauncherSettings = (content: string): LauncherSettings | undefined => {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    return undefined
  }
  if (!isRecord(parsed)) {
    return undefined
  }
  const settings: LauncherSettings = {}
  if (typeof parsed.gameId === 'string') {
    settings.gameId = parsed.gameId
  }
  if (typeof parsed.gameDataPath === 'string') {
    settings.gameDataPath = parsed.gameDataPath
  }
  if (typeof parsed.exePath === 'string') {
    settings.exePath = parsed.exePath
  }
  return settings
}

const readLauncherSettingsFile = async (path: string, fs: FsLike): Promise<string | undefined> => {
  try {
    const stats = await fs.stat(path)
    if (stats.size > MAX_LAUNCHER_SETTINGS_UTF16_LENGTH) {
      return undefined
    }
    return await fs.readFile(path, 'utf-8')
  } catch {
    return undefined
  }
}

export const readLauncherSettings = async (installDir: string, fs: FsLike): Promise<LauncherSettings | undefined> => {
  for (const segments of LAUNCHER_SETTINGS_LOCATIONS) {
    const path = posixJoin(installDir, ...segments)
    const content = await readLauncherSettingsFile(path, fs)
    if (content === undefined) {
      continue
    }
    const settings = parseLauncherSettings(content)
    if (settings !== undefined) {
      return settings
    }
  }
  return undefined
}

export const expandGameDataPath = (
  rawPath: string,
  home: string,
  documentsPath: string,
  localDataHome: string
): string | undefined => {
  if (rawPath.trim().length === 0) {
    return undefined
  }
  let expanded = rawPath.replaceAll('\\', '/')
  if (expanded === '~' || expanded.startsWith('~/')) {
    expanded = home + expanded.slice(1)
  }
  expanded = expanded.replaceAll('%USER_DOCUMENTS%', documentsPath).replaceAll('$LINUX_DATA_HOME', localDataHome)
  if (UNRESOLVED_TOKEN_PATTERN.test(expanded)) {
    return undefined
  }
  return posixNormalize(expanded)
}

export const resolveExecutablePath = (installDir: string, exePath: string): string =>
  posixNormalize(posixJoin(installDir, exePath.replaceAll('\\', '/')))
