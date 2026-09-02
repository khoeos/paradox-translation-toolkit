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

export async function readGeneratedMod(
  modPath: string,
  gameDef: GameContextRef,
  fs: FsLike
): Promise<GeneratedMod | undefined> {
  if (!(await fs.exists(modPath))) return undefined

  const { entries } = await readLocalisationEntries(modPath, gameDef, fs)
  const byNamespace = new Map<string, Map<LanguageCode, Map<string, GeneratedEntry>>>()

  for (const entry of entries) {
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

export function dropOurOwnMod(
  mods: readonly ModFolder[],
  generatedFolder?: string
): { mods: ModFolder[]; selfCopy?: string } {
  if (!generatedFolder) return { mods: [...mods] }
  const ours = mods.find(mod => mod.id.toLowerCase() === generatedFolder.toLowerCase())
  if (!ours) return { mods: [...mods] }
  return { mods: mods.filter(mod => mod !== ours), selfCopy: ours.path }
}

export function summariseGeneratedMod(
  generated: GeneratedMod,
  scanned: readonly ScannedMod[]
): GeneratedModSummary {
  const english = scanned.reduce((sum, mod) => sum + sumByLanguage(mod.englishKeys), 0)
  const kept = scanned.reduce((sum, mod) => sum + sumByLanguage(mod.keptKeys), 0)
  const shadowed = scanned.reduce((sum, mod) => sum + sumByLanguage(mod.shadowedKeys), 0)

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
