import { posixSplit } from './path.js'
import type { FsLike, GameContextRef, LocalisationFilePath, ModFilesResult } from './types.js'
import { walkFiles } from './walk.js'

export function otherLocalisationSpelling(
  dirName: GameContextRef['localisationDirName']
): 'localisation' | 'localization' {
  return dirName === 'localisation' ? 'localization' : 'localisation'
}

export function describeLocalisationFile(
  filePath: string,
  localisationDirName: string
): LocalisationFilePath | null {
  const segments = posixSplit(filePath)
  const locIndex = segments.map(segment => segment.toLowerCase()).lastIndexOf(localisationDirName)
  if (locIndex === -1 || locIndex === segments.length - 1) return null
  return { path: filePath, locIndex, rest: segments.slice(locIndex + 1) }
}

export async function readModFiles(
  modPath: string,
  gameDef: GameContextRef,
  fs: FsLike
): Promise<ModFilesResult> {
  const walked = await walkFiles(modPath, fs, {
    acceptFile: lowerName => lowerName.endsWith('.yml') && lowerName !== 'languages.yml'
  })

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
