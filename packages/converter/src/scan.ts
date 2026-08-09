import { parseFilename } from '@ptt/parser'
import type { LanguageCode } from '@ptt/shared'

import { posixRejoin, posixSplit } from './path.js'
import type { DiscoveredFile, FsLike, GameContextRef, ScanResult } from './types.js'
import { walkFiles } from './walk.js'

export async function scan(
  rootDir: string,
  gameDef: GameContextRef,
  fs: FsLike
): Promise<ScanResult> {
  const files: DiscoveredFile[] = []

  const tokenToLanguage = new Map<string, LanguageCode>()
  for (const [lc, token] of Object.entries(gameDef.languageFileToken)) {
    if (token !== undefined) tokenToLanguage.set(token, lc as LanguageCode)
  }

  const walked = await walkFiles(rootDir, fs, {
    acceptFile: lowerName => lowerName.endsWith('.yml')
  })
  const diagnostics = walked.diagnostics

  for (const fullPath of walked.files) {
    const segments = posixSplit(fullPath)
    // Deepest localisation folder wins: a mod can nest one inside another folder, and the
    // path below it is what identifies the file.
    const locIdx = segments.findLastIndex(s => s === gameDef.localisationDirName)
    if (locIdx === -1) continue

    const name = segments[segments.length - 1] ?? ''
    const parsed = parseFilename(name)
    if (!parsed) {
      diagnostics.push(`Cannot parse filename: ${fullPath}`)
      continue
    }

    const language = tokenToLanguage.get(parsed.language)
    if (!language) {
      diagnostics.push(`Unknown language token "${parsed.language}" in ${fullPath}`)
      continue
    }

    // `modRoot` is rebuilt from the segments of an absolute path and everything downstream
    // composes write targets on it, so it has to keep its root separator.
    const modRoot = posixRejoin(fullPath, segments.slice(0, locIdx))
    // `relativePath` starts at the localisation folder and is relative by design.
    const relativePath = segments.slice(locIdx).join('/')
    const isInOverrideDir = gameDef.overrideSubdirs.some(sub =>
      segments.slice(locIdx).includes(sub)
    )
    const canonicalKey = buildCanonicalKey(relativePath, parsed.language)

    files.push({
      absolutePath: fullPath,
      relativePath,
      modRoot,
      language,
      languageToken: parsed.language,
      canonicalKey,
      isInOverrideDir
    })
  }

  return { rootDir, files, diagnostics }
}

function buildCanonicalKey(relativePath: string, languageToken: string): string {
  return posixSplit(relativePath)
    .map(part => {
      if (part.toLowerCase() === languageToken) return '{LANG}'
      const parsed = parseFilename(part)
      if (parsed && parsed.language === languageToken) {
        return `${parsed.base}_l_{LANG}.yml`
      }
      return part
    })
    .join('/')
}
