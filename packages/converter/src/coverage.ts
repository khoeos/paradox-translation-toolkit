import type { LanguageCode } from '@ptt/shared'

import { mapWithConcurrency } from './concurrency.js'
import { KEY_OVERLAP_MATCH, MOD_CONCURRENCY } from './constants.js'
import { readDescriptor } from './descriptor.js'
import { readModKeys } from './mod-keys.js'
import type { Coverage, FsLike, GameContextRef, ModFolder } from './types.js'

export interface CoverageOptions {
  isCancelled?: () => boolean
  onProgress?: (done: number, total: number) => void
}

export async function buildCoverage(
  mods: readonly ModFolder[],
  gameDef: GameContextRef,
  sourceLanguage: LanguageCode,
  fs: FsLike,
  options: CoverageOptions = {}
): Promise<Map<string, Coverage>> {
  let read = 0
  const scanned = await mapWithConcurrency(mods, MOD_CONCURRENCY, async mod => {
    if (options.isCancelled?.() === true) return undefined
    const descriptor = await readDescriptor(mod.path, fs)
    const keys = await readModKeys(mod.path, gameDef, fs)
    read++
    options.onProgress?.(read, mods.length)
    return { descriptor, keys }
  })

  const coverage = new Map<string, Coverage>()
  if (options.isCancelled?.() === true) return coverage

  const descriptors = scanned.map(entry => entry?.descriptor)
  const allKeys = scanned.map(entry => entry?.keys)

  const byName = new Map<string, number>()
  mods.forEach((_mod, index) => {
    const name = descriptors[index]?.name
    if (name) byName.set(name, index)
  })

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

  mods.forEach((_mod, index) => {
    for (const dependency of descriptors[index]?.dependencies ?? []) {
      const targetIndex = byName.get(dependency)
      if (targetIndex !== undefined && targetIndex !== index) credit(targetIndex, index)
    }
  })

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

    const threshold = translated.size * KEY_OVERLAP_MATCH
    mods.forEach((_other, otherIndex) => {
      const shared = sharedWith.get(otherIndex) ?? 0
      if (shared > 0 && shared >= threshold) credit(otherIndex, index)
    })
  })

  return coverage
}
