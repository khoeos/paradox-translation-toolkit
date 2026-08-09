/**
 * Locating the localisation files of one mod.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts` `listTradFiles` /
 * `parseLocalisationFile`) by Artem Kondrashev.
 */

import { posixSplit } from './path.js'
import type { FsLike, GameContextRef, LocalisationFilePath, ModFilesResult } from './types.js'
import { walkFiles } from './walk.js'

/** The spelling the other Paradox games use for the same folder. */
export function otherLocalisationSpelling(
  dirName: GameContextRef['localisationDirName']
): 'localisation' | 'localization' {
  return dirName === 'localisation' ? 'localization' : 'localisation'
}

/**
 * Describe a localisation file relative to its localisation folder.
 * @param filePath - The file path
 * @param localisationDirName - The game's localisation folder name
 * @returns The described file, or null when it is not below a localisation folder
 */
export function describeLocalisationFile(
  filePath: string,
  localisationDirName: string
): LocalisationFilePath | null {
  const segments = posixSplit(filePath)
  // Deepest localisation folder wins, a mod can nest one inside another folder.
  const locIndex = segments.map(segment => segment.toLowerCase()).lastIndexOf(localisationDirName)
  if (locIndex === -1 || locIndex === segments.length - 1) return null
  return { path: filePath, locIndex, rest: segments.slice(locIndex + 1) }
}

/**
 * List every localisation file of a mod, whatever the layout.
 *
 * `replace/` is walked like any other folder: real mods keep translated strings there and
 * skipping it silently ignored them (Succession Expanded: 4 files, 11 keys).
 * @param modPath - The mod folder
 * @param gameDef - The game, for its localisation folder spelling
 * @param fs - The injected filesystem
 * @returns The described files, plus whether the other spelling was seen and any read errors
 */
export async function readModFiles(
  modPath: string,
  gameDef: GameContextRef,
  fs: FsLike
): Promise<ModFilesResult> {
  const walked = await walkFiles(modPath, fs, {
    acceptFile: lowerName => lowerName.endsWith('.yml')
  })

  // The two spellings are a classic mix-up: CK3 says localization, the others localisation.
  // A folder spelled the other way means the wrong game is probably selected, so it is
  // reported even when it holds nothing.
  const other = otherLocalisationSpelling(gameDef.localisationDirName)
  const otherSpelling = walked.dirs.some(dir => {
    const segments = posixSplit(dir)
    const last = segments[segments.length - 1]?.toLowerCase()
    return last === other
  })

  const files: LocalisationFilePath[] = []
  for (const file of walked.files) {
    const described = describeLocalisationFile(file, gameDef.localisationDirName)
    if (described) files.push(described)
  }

  return { files, otherSpelling, diagnostics: walked.diagnostics }
}
