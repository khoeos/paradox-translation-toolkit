/**
 * Reading back what an earlier run of this tool wrote.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts` `readGeneratedMod` /
 * `dropOurOwnMod` / `summariseGeneratedMod`) by Artem Kondrashev.
 */

import type { LanguageCode } from '@ptt/shared'

import { readLocalisationEntries } from './mod-keys.js'
import { getModNamespace } from './naming.js'
import { sumByLanguage } from './totals.js'
import type {
  FsLike,
  GameContextRef,
  GeneratedEntry,
  GeneratedMod,
  GeneratedModSummary,
  ModFolder,
  ScannedMod
} from './types.js'

/**
 * Read back the mod this tool generated on an earlier run.
 *
 * Without it a second scan reports everything as missing again, because the generated mod
 * lives under the game user folder and never appears in the scanned workshop folder. The
 * first folder below the language is the namespace built by `getModNamespace`, which is what
 * ties a generated file back to the mod it was generated for.
 * @param modPath - The generated mod folder
 * @param gameDef - The game
 * @param fs - The injected filesystem
 * @returns The generated keys, or undefined when nothing was generated yet
 */
export async function readGeneratedMod(
  modPath: string,
  gameDef: GameContextRef,
  fs: FsLike
): Promise<GeneratedMod | undefined> {
  if (!(await fs.exists(modPath))) return undefined

  // Read the raw entries rather than `readModKeys`: that one keeps one key per language,
  // which is right for a real mod but wrong here. Two source mods can declare the same key
  // name, and inside the generated mod the namespace is part of the identity. Deduplicating
  // per language would hide the second namespace's translation, so every run would report it
  // missing and pay a translator for it again.
  const { entries } = await readLocalisationEntries(modPath, gameDef, fs)
  const byNamespace = new Map<string, Map<LanguageCode, Map<string, GeneratedEntry>>>()

  for (const entry of entries) {
    // rest is [language, namespace, ...path, file]; a file sitting straight under the
    // language folder was not written by us and belongs to no mod.
    const namespace = entry.described.rest.length > 2 ? (entry.described.rest[1] ?? '') : ''
    let languages = byNamespace.get(namespace)
    if (!languages) {
      languages = new Map()
      byNamespace.set(namespace, languages)
    }
    let map = languages.get(entry.language)
    if (!map) {
      map = new Map()
      languages.set(entry.language, map)
    }
    if (map.has(entry.key)) continue
    map.set(entry.key, { value: entry.value, file: entry.file })
  }

  return { path: modPath, byNamespace }
}

/**
 * Take our own output out of the list of mods to scan.
 *
 * A copy of the generated mod sitting in the scanned folder, which is what happens when it is
 * moved next to the workshop mods, carries no source language and repeats other mods' keys,
 * so the coverage heuristic reads it as a third-party localisation mod. It would then vouch
 * for its own source-language leftovers and hide the very work it was generated to do.
 * @param mods - Every discovered mod folder
 * @param generatedFolder - Folder name of the generated mod
 * @returns The mods to scan, and the path of the copy that was dropped
 */
export function dropOurOwnMod(
  mods: readonly ModFolder[],
  generatedFolder?: string
): { mods: ModFolder[]; selfCopy?: string } {
  if (!generatedFolder) return { mods: [...mods] }
  const ours = mods.find(mod => mod.id.toLowerCase() === generatedFolder.toLowerCase())
  if (!ours) return { mods: [...mods] }
  return { mods: mods.filter(mod => mod !== ours), selfCopy: ours.path }
}

/**
 * What the generated mod contributes, and what in it belongs to nothing any more.
 * @param generated - The generated mod read back from disk
 * @param scanned - The scanned mods
 * @returns The summary shown next to the scan totals
 */
export function summariseGeneratedMod(
  generated: GeneratedMod,
  scanned: readonly ScannedMod[]
): GeneratedModSummary {
  const english = scanned.reduce((sum, mod) => sum + sumByLanguage(mod.englishKeys), 0)
  const kept = scanned.reduce((sum, mod) => sum + sumByLanguage(mod.keptKeys), 0)
  const shadowed = scanned.reduce((sum, mod) => sum + sumByLanguage(mod.shadowedKeys), 0)

  // A namespace matching no scanned mod comes from a mod that was renamed or unsubscribed.
  const known = new Set<string>()
  for (const mod of scanned) known.add(getModNamespace(mod.id, mod.name))

  let total = 0
  const orphanNamespaces: string[] = []
  for (const [namespace, languages] of generated.byNamespace) {
    if (namespace !== '' && !known.has(namespace)) {
      orphanNamespaces.push(namespace)
      continue
    }
    for (const keys of languages.values()) total += keys.size
  }

  return {
    path: generated.path,
    translated: total - english - kept - shadowed,
    english,
    kept,
    shadowed,
    orphanNamespaces
  }
}
