import { posixBasename, posixJoin } from './path.js'
import type { DiscoveredMods, FsLike, GameContextRef } from './types.js'

export async function discoverMods(
  rootPath: string,
  gameDef: GameContextRef,
  fs: FsLike
): Promise<DiscoveredMods> {
  const entries = await fs.readdir(rootPath)

  const isSingleMod = entries.some(
    entry =>
      (entry.isFile && entry.name.toLowerCase().endsWith('.mod')) ||
      (entry.isDirectory && entry.name.toLowerCase() === gameDef.localisationDirName)
  )

  if (isSingleMod) return asSingle(rootPath)

  const subFolders = entries
    .filter(entry => entry.isDirectory && !entry.name.startsWith('.'))
    .map(entry => ({ id: entry.name, path: posixJoin(rootPath, entry.name) }))

  if (subFolders.length === 0) return asSingle(rootPath)

  return { mods: subFolders, single: false }
}

function asSingle(rootPath: string): DiscoveredMods {
  return { mods: [{ id: posixBasename(rootPath), path: rootPath }], single: true }
}
