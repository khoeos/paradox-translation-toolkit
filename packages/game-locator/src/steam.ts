import { posixJoin, posixNormalize, posixNormalizeStrict } from '@ptt/converter'
import type { FsLike, RegistryLike } from '@ptt/shared'

import type { Platform } from './platform.js'
import { MAX_VDF_CONTENT_UTF16_LENGTH, parseVdf } from './vdf.js'
import type { VdfNode, VdfValue } from './vdf.js'

const WIN32_DEFAULT_STEAM_PATH = 'C:/Program Files (x86)/Steam'
const STEAM_REGISTRY_KEY = 'Software\\Valve\\Steam'
const STEAM_REGISTRY_VALUE_NAME = 'SteamPath'
const NUMERIC_KEY_PATTERN = /^\d+$/

const isVdfNode = (value: VdfValue | undefined): value is VdfNode =>
  typeof value === 'object' && value !== null

const getVdfChild = (node: VdfNode, key: string): VdfNode | undefined => {
  const value = node[key]
  return isVdfNode(value) ? value : undefined
}

const getVdfString = (node: VdfNode, key: string): string | undefined => {
  const value = node[key]
  return typeof value === 'string' ? value : undefined
}

const readVdfFile = async (path: string, fs: FsLike): Promise<VdfNode> => {
  try {
    const stats = await fs.stat(path)
    if (stats.size > MAX_VDF_CONTENT_UTF16_LENGTH) {
      return {}
    }
    const content = await fs.readFile(path, 'utf-8')
    return parseVdf(content)
  } catch {
    return {}
  }
}

const dedupe = (values: readonly string[]): string[] => {
  const seenLowercase = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const key = value.toLowerCase()
    if (seenLowercase.has(key)) {
      continue
    }
    seenLowercase.add(key)
    result.push(value)
  }
  return result
}

const isSafeInstallDir = (installDir: string): boolean => {
  if (installDir.trim().length === 0) {
    return false
  }
  try {
    return !posixNormalizeStrict(installDir).includes('/')
  } catch {
    return false
  }
}

const findWindowsSteamRoot = async (
  fs: FsLike,
  registry: RegistryLike
): Promise<string | undefined> => {
  const fromHkcu = await registry.readValue('HKCU', STEAM_REGISTRY_KEY, STEAM_REGISTRY_VALUE_NAME)
  const fromRegistry =
    fromHkcu ?? (await registry.readValue('HKLM', STEAM_REGISTRY_KEY, STEAM_REGISTRY_VALUE_NAME))
  const candidate =
    fromRegistry !== undefined ? posixNormalize(fromRegistry) : WIN32_DEFAULT_STEAM_PATH
  return (await fs.exists(candidate)) ? candidate : undefined
}

export const findSteamRoot = async (
  platform: Platform,
  home: string,
  fs: FsLike,
  registry: RegistryLike
): Promise<string | undefined> => {
  if (platform === 'win32') {
    return findWindowsSteamRoot(fs, registry)
  }
  if (platform === 'darwin') {
    const path = posixJoin(home, 'Library', 'Application Support', 'Steam')
    return (await fs.exists(path)) ? path : undefined
  }
  const nativePath = posixJoin(home, '.local', 'share', 'Steam')
  if (await fs.exists(nativePath)) {
    return nativePath
  }
  const flatpakPath = posixJoin(
    home,
    '.var',
    'app',
    'com.valvesoftware.Steam',
    '.local',
    'share',
    'Steam'
  )
  return (await fs.exists(flatpakPath)) ? flatpakPath : undefined
}

const readConfigVdfLibraries = async (steamRoot: string, fs: FsLike): Promise<string[]> => {
  const root = await readVdfFile(posixJoin(steamRoot, 'config', 'config.vdf'), fs)
  const installConfigStore = getVdfChild(root, 'InstallConfigStore')
  const software = installConfigStore ? getVdfChild(installConfigStore, 'Software') : undefined
  const valve = software ? getVdfChild(software, 'Valve') : undefined
  const steam = valve ? getVdfChild(valve, 'Steam') : undefined
  if (steam === undefined) {
    return []
  }
  const libraries: string[] = []
  for (const [key, value] of Object.entries(steam)) {
    if (key.startsWith('BaseInstallFolder_') && typeof value === 'string') {
      libraries.push(posixNormalize(value))
    }
  }
  return libraries
}

const readNewLibraryFoldersVdf = async (steamRoot: string, fs: FsLike): Promise<string[]> => {
  const root = await readVdfFile(posixJoin(steamRoot, 'config', 'libraryfolders.vdf'), fs)
  const libraryFolders = getVdfChild(root, 'libraryfolders')
  if (libraryFolders === undefined) {
    return []
  }
  const libraries: string[] = []
  for (const value of Object.values(libraryFolders)) {
    if (!isVdfNode(value)) {
      continue
    }
    const path = getVdfString(value, 'path')
    if (path !== undefined) {
      libraries.push(posixNormalize(path))
    }
  }
  return libraries
}

const readOldLibraryFoldersVdf = async (steamRoot: string, fs: FsLike): Promise<string[]> => {
  const root = await readVdfFile(posixJoin(steamRoot, 'steamapps', 'libraryfolders.vdf'), fs)
  const libraryFolders = getVdfChild(root, 'LibraryFolders')
  if (libraryFolders === undefined) {
    return []
  }
  const libraries: string[] = []
  for (const [key, value] of Object.entries(libraryFolders)) {
    if (NUMERIC_KEY_PATTERN.test(key) && typeof value === 'string') {
      libraries.push(posixNormalize(value))
    }
  }
  return libraries
}

export const findLibraryFolders = async (steamRoot: string, fs: FsLike): Promise<string[]> => {
  const normalizedSteamRoot = posixNormalize(steamRoot)
  const configLibraries = await readConfigVdfLibraries(normalizedSteamRoot, fs)
  const newFormatLibraries = await readNewLibraryFoldersVdf(normalizedSteamRoot, fs)
  const legacyLibraries =
    newFormatLibraries.length > 0 ? [] : await readOldLibraryFoldersVdf(normalizedSteamRoot, fs)
  return dedupe([
    normalizedSteamRoot,
    ...configLibraries,
    ...newFormatLibraries,
    ...legacyLibraries
  ])
}

export const findGameInstallDir = async (
  libraries: readonly string[],
  appId: number,
  fs: FsLike
): Promise<string | undefined> => {
  for (const library of libraries) {
    const manifestPath = posixJoin(library, 'steamapps', `appmanifest_${appId}.acf`)
    const manifest = await readVdfFile(manifestPath, fs)
    const appState = getVdfChild(manifest, 'AppState')
    const installDir = appState ? getVdfString(appState, 'installdir') : undefined
    if (installDir === undefined || !isSafeInstallDir(installDir)) {
      continue
    }
    const installPath = posixJoin(library, 'steamapps', 'common', installDir)
    if (await fs.exists(installPath)) {
      return installPath
    }
  }
  return undefined
}

export const findWorkshopContentDir = async (
  libraries: readonly string[],
  appId: number,
  fs: FsLike
): Promise<string[]> => {
  const found: string[] = []
  for (const library of libraries) {
    const contentPath = posixJoin(library, 'steamapps', 'workshop', 'content', String(appId))
    if (await fs.exists(contentPath)) {
      found.push(contentPath)
    }
  }
  return dedupe(found)
}
