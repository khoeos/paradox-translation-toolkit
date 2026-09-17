import { parse } from '@ptt/parser'
import type { LanguageCode } from '@ptt/shared'

import { MAX_MOD_LOCALISATION_BYTES, MAX_SOURCE_FILE_BYTES } from './constants.js'
import { getParseSeverity } from './diagnostics.js'
import { readModFiles } from './mod-files.js'
import type { FsLike, GameContextRef, LocalisationEntry, ModEntries, ModKeys } from './types.js'
import { stringifyError } from './walk.js'

export async function readLocalisationEntries(
  modPath: string,
  gameDef: GameContextRef,
  fs: FsLike
): Promise<ModEntries> {
  const { files, otherSpelling, diagnostics } = await readModFiles(modPath, gameDef, fs)
  const entries: LocalisationEntry[] = []

  const tokenToLanguage = new Map<string, LanguageCode>()
  for (const [lc, token] of Object.entries(gameDef.languageFileToken)) {
    if (token !== undefined) tokenToLanguage.set(token, lc as LanguageCode)
  }

  let budget = MAX_MOD_LOCALISATION_BYTES
  let truncated = false

  for (const [index, described] of files.entries()) {
    let size: number
    try {
      size = (await fs.stat(described.path)).size
    } catch (err) {
      diagnostics.push({ severity: 'error', message: `${described.path} : ${stringifyError(err)}` })
      continue
    }

    if (size > MAX_SOURCE_FILE_BYTES) {
      diagnostics.push({
        severity: 'error',
        message: `${described.path} exceeds ${MAX_SOURCE_FILE_BYTES} bytes and was not read`
      })
      continue
    }

    if (size > budget) {
      truncated = true
      diagnostics.push({
        severity: 'error',
        message: `${modPath} declares more than ${MAX_MOD_LOCALISATION_BYTES} bytes of localisation : stopped at ${described.path}, ${files.length - index} file(s) left unread`
      })
      break
    }
    budget -= size

    let content: string
    try {
      content = await fs.readFile(described.path, 'utf-8')
    } catch (err) {
      diagnostics.push({ severity: 'error', message: `${described.path} : ${stringifyError(err)}` })
      continue
    }

    const parsed = parse(content)
    for (const diagnostic of parsed.diagnostics) {
      diagnostics.push({
        severity: getParseSeverity(diagnostic.code),
        message: `${described.path}:${diagnostic.line} : ${diagnostic.message}`
      })
    }

    const token = parsed.file.language
    if (token === '') continue

    const language = tokenToLanguage.get(token)
    if (language === undefined) {
      diagnostics.push({
        severity: 'warning',
        message: `Language token "${token}" in ${described.path} is not used by this game, kept`
      })
    }

    for (const entry of parsed.file.entries) {
      entries.push({
        key: entry.key,
        file: described.path,
        described,
        token,
        ...(language !== undefined && { language }),
        value: entry.value
      })
    }
  }

  return { files: files.length, entries, otherSpelling, diagnostics, truncated }
}

export async function readModKeys(
  modPath: string,
  gameDef: GameContextRef,
  fs: FsLike
): Promise<ModKeys> {
  const { files, entries, otherSpelling, diagnostics, truncated } = await readLocalisationEntries(
    modPath,
    gameDef,
    fs
  )
  const byLanguage = new Map<LanguageCode, Map<string, LocalisationEntry>>()

  for (const entry of entries) {
    const { language } = entry
    if (language === undefined) continue
    let keys = byLanguage.get(language)
    if (!keys) {
      keys = new Map()
      byLanguage.set(language, keys)
    }
    if (keys.has(entry.key)) continue
    keys.set(entry.key, entry)
  }

  return { files, byLanguage, otherSpelling, diagnostics, truncated }
}
