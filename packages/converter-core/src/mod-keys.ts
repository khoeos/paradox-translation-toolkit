/**
 * Reading every localisation key a mod declares.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts` `readModKeys`) by
 * Artem Kondrashev.
 */

import { parse } from '@ptt/parser-core'
import type { LanguageCode } from '@ptt/shared-types'

import { readModFiles } from './mod-files.js'
import type { FsLike, GameContextRef, LocalisationEntry, ModEntries, ModKeys } from './types.js'
import { stringifyError } from './walk.js'

/**
 * Read every localisation entry of a mod, in file order, with nothing deduplicated.
 *
 * The `l_<language>:` header is what the game actually reads, not the folder name, so it
 * decides the language of a file. A file whose header names a language the game does not
 * declare is skipped with a diagnostic rather than tracked under a raw token: nothing
 * downstream could ever act on it.
 * @param modPath - The mod folder
 * @param gameDef - The game, for its localisation folder and language tokens
 * @param fs - The injected filesystem
 * @returns Every entry found, plus the file count and any read diagnostics
 */
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

  for (const described of files) {
    let content: string
    try {
      content = await fs.readFile(described.path, 'utf-8')
    } catch (err) {
      diagnostics.push(`${described.path} : ${stringifyError(err)}`)
      continue
    }

    const parsed = parse(content)
    // A file with no `l_<language>:` header yields no entries at all, because the games do
    // not load one either. Report it rather than dropping it silently: the original inferred
    // the language from the folder name, which hid a malformed file behind a plausible guess.
    for (const diagnostic of parsed.diagnostics) {
      if (diagnostic.severity === 'error') {
        diagnostics.push(`${described.path}:${diagnostic.line} : ${diagnostic.message}`)
      }
    }

    const language = tokenToLanguage.get(parsed.file.language)
    if (!language) {
      if (parsed.file.language !== '') {
        diagnostics.push(`Unknown language token "${parsed.file.language}" in ${described.path}`)
      }
      continue
    }

    for (const entry of parsed.file.entries) {
      entries.push({
        key: entry.key,
        file: described.path,
        described,
        language,
        value: entry.value
      })
    }
  }

  return { files: files.length, entries, otherSpelling, diagnostics }
}

/**
 * Read every localisation key a mod declares, grouped by language.
 *
 * One key per language, first declaration winning, which is how the game resolves a
 * duplicated key too.
 * @param modPath - The mod folder
 * @param gameDef - The game, for its localisation folder and language tokens
 * @param fs - The injected filesystem
 * @returns Language to key to where that key was declared
 */
export async function readModKeys(
  modPath: string,
  gameDef: GameContextRef,
  fs: FsLike
): Promise<ModKeys> {
  const { files, entries, otherSpelling, diagnostics } = await readLocalisationEntries(
    modPath,
    gameDef,
    fs
  )
  const byLanguage = new Map<LanguageCode, Map<string, LocalisationEntry>>()

  for (const entry of entries) {
    let keys = byLanguage.get(entry.language)
    if (!keys) {
      keys = new Map()
      byLanguage.set(entry.language, keys)
    }
    if (keys.has(entry.key)) continue
    keys.set(entry.key, entry)
  }

  return { files, byLanguage, otherSpelling, diagnostics }
}
