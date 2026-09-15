import { posixNormalize } from '@ptt/converter'
import type { RegistryLike } from '@ptt/shared'
import type { Platform } from './platform.js'

const GOG_APP_IDS: Partial<Record<string, string>> = {
  stellaris: '1508702879',
  imperator: '2131232214',
}

const readGogPath = async (registry: RegistryLike, appId: string, hive: 'HKCU' | 'HKLM') => {
  const value = await registry.readValue(hive, `Software\\GOG.com\\Games\\${appId}`, 'path')
  return value !== undefined && value.trim().length > 0 ? posixNormalize(value) : undefined
}

export const findGogInstall = async (
  gameId: string,
  platform: Platform,
  registry: RegistryLike
): Promise<string | undefined> => {
  if (platform !== 'win32') {
    return undefined
  }

  const appId = GOG_APP_IDS[gameId]
  if (appId === undefined) {
    return undefined
  }

  const fromHkcu = await readGogPath(registry, appId, 'HKCU')
  if (fromHkcu !== undefined) {
    return fromHkcu
  }

  return readGogPath(registry, appId, 'HKLM')
}
