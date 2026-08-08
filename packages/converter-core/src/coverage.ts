/**
 * Which mods already have their translation supplied by somebody else.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts` `buildCoverage`) by
 * Artem Kondrashev.
 */

import type { LanguageCode } from '@ptt/shared-types'

import { mapWithConcurrency } from './concurrency.js'
import { KEY_OVERLAP_MATCH, MOD_CONCURRENCY } from './constants.js'
import { readDescriptor } from './descriptor.js'
import { readModKeys } from './mod-keys.js'
import type { Coverage, FsLike, GameContextRef, ModFolder } from './types.js'

/**
 * Keys already translated for each mod, including the ones supplied by separate localisation
 * mods.
 *
 * Computed over **every** discovered mod, not only the selected ones: a localisation mod the
 * user did not tick still covers the mod it patches, and generating those keys anyway would
 * shadow real work.
 *
 * `supported_version` cannot answer whether a translation is stale (a mod declaring 1.19.0.5
 * against an original at 1.19.0.6 still covered all 182 keys), so only the key diff counts.
 * @param mods - Every discovered mod folder
 * @param gameDef - The game
 * @param sourceLanguage - The language the collection is translated *from*
 * @param fs - The injected filesystem
 * @returns Mod id to the coverage supplied by its localisation mods
 */
export async function buildCoverage(
  mods: readonly ModFolder[],
  gameDef: GameContextRef,
  sourceLanguage: LanguageCode,
  fs: FsLike
): Promise<Map<string, Coverage>> {
  const descriptors = await mapWithConcurrency(mods, MOD_CONCURRENCY, mod =>
    readDescriptor(mod.path, fs)
  )
  const allKeys = await mapWithConcurrency(mods, MOD_CONCURRENCY, mod =>
    readModKeys(mod.path, gameDef, fs)
  )

  const byName = new Map<string, number>()
  mods.forEach((_mod, index) => {
    const name = descriptors[index]?.name
    if (name) byName.set(name, index)
  })

  const coverage = new Map<string, Coverage>()
  const credit = (targetIndex: number, patchIndex: number): void => {
    const target = mods[targetIndex]
    const patchKeys = allKeys[patchIndex]
    if (!target || !patchKeys) return

    let entry = coverage.get(target.id)
    if (!entry) {
      entry = { byLanguage: new Map(), sources: [] }
      coverage.set(target.id, entry)
    }

    const name = descriptors[patchIndex]?.name ?? mods[patchIndex]?.id ?? ''
    if (name && !entry.sources.includes(name)) entry.sources.push(name)

    for (const [language, entries] of patchKeys.byLanguage) {
      if (language === sourceLanguage) continue
      const merged = entry.byLanguage.get(language) ?? new Set<string>()
      for (const key of entries.keys()) merged.add(key)
      entry.byLanguage.set(language, merged)
    }
  }

  // First path: a declared dependency, resolved by name.
  mods.forEach((_mod, index) => {
    for (const dependency of descriptors[index]?.dependencies ?? []) {
      const targetIndex = byName.get(dependency)
      if (targetIndex !== undefined && targetIndex !== index) credit(targetIndex, index)
    }
  })

  // One index over every source key, rather than re-probing each candidate mod's key set once
  // per patch: the pairwise form was O(patches x mods x keys), which on a real collection is
  // tens of millions of set lookups for the same answer.
  const ownersOfKey = new Map<string, number[]>()
  mods.forEach((_mod, index) => {
    const sourceKeys = allKeys[index]?.byLanguage.get(sourceLanguage)
    if (!sourceKeys || sourceKeys.size === 0) return
    for (const key of sourceKeys.keys()) {
      const owners = ownersOfKey.get(key)
      if (owners) owners.push(index)
      else ownersOfKey.set(key, [index])
    }
  })

  // Second path: plenty of localisation mods never fill in dependencies. One that carries no
  // source language of its own but repeats another mod's keys is patching that mod, whatever
  // its descriptor says.
  mods.forEach((_mod, index) => {
    const keys = allKeys[index]
    if (!keys) return
    const ownSource = keys.byLanguage.get(sourceLanguage)
    if (ownSource && ownSource.size > 0) return

    const translated = new Set<string>()
    for (const [language, entries] of keys.byLanguage) {
      if (language === sourceLanguage) continue
      for (const key of entries.keys()) translated.add(key)
    }
    if (translated.size === 0) return

    const sharedWith = new Map<number, number>()
    for (const key of translated) {
      for (const owner of ownersOfKey.get(key) ?? []) {
        if (owner === index) continue
        sharedWith.set(owner, (sharedWith.get(owner) ?? 0) + 1)
      }
    }

    // Half of the patch landing on one mod is no coincidence. Known limitation, audit
    // finding S-21: the overlap is measured on key NAMES only, so a false positive credits
    // a whole patch to the wrong mod. See docs/known-issues.md.
    const threshold = translated.size * KEY_OVERLAP_MATCH
    // In mod order, so the crediting order does not depend on Map insertion order.
    mods.forEach((_other, otherIndex) => {
      const shared = sharedWith.get(otherIndex) ?? 0
      if (shared > 0 && shared >= threshold) credit(otherIndex, index)
    })
  })

  return coverage
}
