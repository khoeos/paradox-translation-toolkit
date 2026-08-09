/**
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts` `discoverMods`) by
 * Artem Kondrashev.
 */

import { posixBasename, posixJoin } from './path.js'
import type { DiscoveredMods, FsLike, GameContextRef } from './types.js'

/**
 * Decide whether the selected folder is a single mod or a folder holding many mods.
 *
 * A `.mod` file or a localisation folder at the root means the selection *is* the mod.
 * Otherwise every visible subfolder is a candidate mod. A read failure on the root is the
 * one error that propagates: there is nothing to report on.
 * @param rootPath - The selected folder
 * @param gameDef - The game, for its localisation folder spelling
 * @param fs - The injected filesystem
 * @returns The mod folders to process, and whether the root itself is the mod
 */
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

  // Nothing below: treat the selection itself as the mod so the run still reports something.
  if (subFolders.length === 0) return asSingle(rootPath)

  return { mods: subFolders, single: false }
}

function asSingle(rootPath: string): DiscoveredMods {
  return { mods: [{ id: posixBasename(rootPath), path: rootPath }], single: true }
}
