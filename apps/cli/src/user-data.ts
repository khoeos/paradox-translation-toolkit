import { homedir } from 'node:os'

import { posixJoin } from '@ptt/converter'

export const APP_FOLDER = 'Paradox Translation Toolkit'

export function defaultUserDataPath(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  home: string
): string {
  if (platform === 'win32') {
    const appData = env.APPDATA ?? posixJoin(home, 'AppData/Roaming')
    return posixJoin(appData, APP_FOLDER)
  }
  if (platform === 'darwin') {
    return posixJoin(home, 'Library/Application Support', APP_FOLDER)
  }
  const configHome = env.XDG_CONFIG_HOME ?? posixJoin(home, '.config')
  return posixJoin(configHome, APP_FOLDER)
}

export function defaultDocumentsPath(home: string): string {
  return posixJoin(home, 'Documents')
}

export function resolveUserData(explicit?: string): string {
  if (explicit !== undefined && explicit.trim().length > 0) return explicit
  return defaultUserDataPath(process.platform, process.env, homedir())
}

export function resolveDocuments(explicit?: string): string {
  if (explicit !== undefined && explicit.trim().length > 0) return explicit
  return defaultDocumentsPath(homedir())
}
