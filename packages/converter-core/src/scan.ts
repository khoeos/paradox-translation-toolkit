import { parseFilename } from '@ptt/parser-core'
import type { LanguageCode } from '@ptt/shared-types'

import { posixJoin, posixSplit } from './path.js'
import type { DiscoveredFile, FsLike, GameContextRef, ScanResult } from './types.js'

export async function scan(
  rootDir: string,
  gameDef: GameContextRef,
  fs: FsLike
): Promise<ScanResult> {
  const files: DiscoveredFile[] = []
  const diagnostics: string[] = []

  const tokenToLanguage = new Map<string, LanguageCode>()
  for (const [lc, token] of Object.entries(gameDef.languageFileToken)) {
    if (token !== undefined) tokenToLanguage.set(token, lc as LanguageCode)
  }

  await walk(rootDir, gameDef, tokenToLanguage, fs, files, diagnostics)

  return { rootDir, files, diagnostics }
}

async function walk(
  currentDir: string,
  gameDef: GameContextRef,
  tokenToLang: Map<string, LanguageCode>,
  fs: FsLike,
  out: DiscoveredFile[],
  diags: string[]
): Promise<void> {
  let entries
  try {
    entries = await fs.readdir(currentDir)
  } catch (err) {
    diags.push(`readdir failed for ${currentDir}: ${stringifyError(err)}`)
    return
  }

  for (const entry of entries) {
    const fullPath = posixJoin(currentDir, entry.name)

    if (entry.isSymlink) {
      diags.push(`Skipped symlink (potential traversal): ${fullPath}`)
      continue
    }
    if (entry.isDirectory) {
      await walk(fullPath, gameDef, tokenToLang, fs, out, diags)
      continue
    }
    if (!entry.isFile) continue
    if (!entry.name.toLowerCase().endsWith('.yml')) continue

    const segments = posixSplit(fullPath)
    const locIdx = segments.findIndex(s => s === gameDef.localisationDirName)
    if (locIdx === -1) continue

    const parsed = parseFilename(entry.name)
    if (!parsed) {
      diags.push(`Cannot parse filename: ${fullPath}`)
      continue
    }

    const language = tokenToLang.get(parsed.language)
    if (!language) {
      diags.push(`Unknown language token "${parsed.language}" in ${fullPath}`)
      continue
    }

    const modRoot = segments.slice(0, locIdx).join('/')
    const relativePath = segments.slice(locIdx).join('/')
    const isInOverrideDir = gameDef.overrideSubdirs.some(sub =>
      segments.slice(locIdx).includes(sub)
    )
    const canonicalKey = buildCanonicalKey(relativePath, parsed.language)

    out.push({
      absolutePath: fullPath,
      relativePath,
      modRoot,
      language,
      languageToken: parsed.language,
      canonicalKey,
      isInOverrideDir
    })
  }
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

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
