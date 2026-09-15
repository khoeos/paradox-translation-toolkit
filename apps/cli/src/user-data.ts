import { homedir } from 'node:os'

import { posixJoin } from '@ptt/converter'
import { nodeRegistry, resolveDocumentsPath, resolveParadoxDataHome } from '@ptt/fs-node'
import type { RegistryLike } from '@ptt/shared'

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

export function resolveUserData(explicit?: string): string {
  if (explicit !== undefined && explicit.trim().length > 0) return explicit
  return defaultUserDataPath(process.platform, process.env, homedir())
}

export async function resolveDocumentsFrom(
  explicit: string | undefined,
  platform: NodeJS.Platform,
  home: string,
  registry: RegistryLike,
  xdgDataHome: string | undefined
): Promise<string> {
  const trimmed = explicit?.trim()
  if (trimmed !== undefined && trimmed.length > 0) return trimmed
  const documents = await resolveDocumentsPath(platform, home, registry)
  return resolveParadoxDataHome(platform, home, documents, xdgDataHome)
}

export function resolveDocuments(explicit?: string): Promise<string> {
  return resolveDocumentsFrom(
    explicit,
    process.platform,
    homedir(),
    nodeRegistry,
    process.env.XDG_DATA_HOME
  )
}
