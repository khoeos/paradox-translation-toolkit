import Store from 'electron-store'
import { z } from 'zod'

import { getAllGameIds, getGame } from '@ptt/games'
import { DEFAULT_UI_LANGUAGE, VALID_UI_LANGUAGES, type UiLanguage } from '@ptt/i18n'
import {
  ConvertModeSchema,
  LanguageCodeSchema,
  TargetContentSchema,
  TranslationTargetSchema,
  targetsFromLanguages,
  type ConvertMode,
  type LanguageCode,
  type TargetContent,
  type TranslationTarget
} from '@ptt/shared'

import { log } from '../log.js'
import { canonicalizeCasePreserving } from './path-policy.js'

const GameIdSchema = z.enum(getAllGameIds())

const MAX_RECENT_PATHS_PER_GAME = 5

export type UpdateChannel = 'stable' | 'beta'

export const KNOWN_PATH_KINDS = ['modFolder', 'gameInstall'] as const

export type KnownPathKind = (typeof KNOWN_PATH_KINDS)[number]

export interface KnownPathEntry {
  path: string
  gameId: string
  kind: KnownPathKind
  lastUsedAt: string
  pinned: boolean
}

export interface SettingsSchema {
  lastModFolder: Partial<Record<string, string>>
  lastOutputFolder: Partial<Record<string, string>>
  gamePath: Partial<Record<string, string>>
  defaultSourceLanguage: LanguageCode
  sourceLanguage: Partial<Record<string, LanguageCode>>
  targetLanguages: Partial<Record<string, LanguageCode[]>>
  targets: Partial<Record<string, TranslationTarget[]>>
  mode: ConvertMode
  targetContent: TargetContent
  themeOverride: 'system' | 'light' | 'dark'
  uiLanguage: UiLanguage
  lastGameId: string | null
  autoCheckUpdates: boolean
  updateChannel: UpdateChannel
  userAllowedFolders: string[]
  knownPaths: KnownPathEntry[]
}

export type SettingsPatch = {
  [K in keyof SettingsSchema]?: SettingsSchema[K] | undefined
}

export const DEFAULTS: SettingsSchema = {
  lastModFolder: {},
  lastOutputFolder: {},
  gamePath: {},
  defaultSourceLanguage: 'en',
  sourceLanguage: {},
  targetLanguages: {},
  targets: {},
  mode: 'add-to-current',
  targetContent: 'missing-keys',
  themeOverride: 'system',
  uiLanguage: DEFAULT_UI_LANGUAGE,
  lastGameId: null,
  autoCheckUpdates: true,
  updateChannel: 'stable',
  userAllowedFolders: [],
  knownPaths: []
}

export const KnownPathKindSchema = z.enum(KNOWN_PATH_KINDS)

export const KnownPathEntrySchemaZod = z.object({
  path: z.string(),
  gameId: GameIdSchema,
  kind: KnownPathKindSchema.default('modFolder'),
  lastUsedAt: z.iso.datetime(),
  pinned: z.boolean()
})

export const SettingsSchemaZod = z.object({
  lastModFolder: z.partialRecord(GameIdSchema, z.string()),
  lastOutputFolder: z.partialRecord(GameIdSchema, z.string()),
  gamePath: z.partialRecord(GameIdSchema, z.string()),
  defaultSourceLanguage: LanguageCodeSchema,
  sourceLanguage: z.partialRecord(GameIdSchema, LanguageCodeSchema),
  targetLanguages: z.partialRecord(GameIdSchema, z.array(LanguageCodeSchema)),
  targets: z.partialRecord(GameIdSchema, z.array(TranslationTargetSchema)),
  mode: ConvertModeSchema,
  targetContent: TargetContentSchema,
  themeOverride: z.enum(['system', 'light', 'dark']),
  uiLanguage: z.enum(VALID_UI_LANGUAGES),
  lastGameId: GameIdSchema.nullable(),
  autoCheckUpdates: z.boolean(),
  updateChannel: z.enum(['stable', 'beta']),
  userAllowedFolders: z.array(z.string()),
  knownPaths: z.array(KnownPathEntrySchemaZod)
})

interface LegacyKeyStore {
  delete(key: string): void
}

const migrateOverwrite = (raw: unknown): SettingsPatch => {
  if (typeof raw !== 'object' || raw === null || !('overwrite' in raw)) return {}
  const legacy = raw.overwrite
  if (typeof legacy !== 'boolean') return {}
  return { targetContent: legacy ? 'complete-file' : 'missing-keys' }
}

const migrateTargets = (raw: unknown): SettingsPatch => {
  if (typeof raw !== 'object' || raw === null || !('targetLanguages' in raw)) return {}
  const legacy = raw.targetLanguages
  if (typeof legacy !== 'object' || legacy === null) return {}

  const existing = new Map(
    'targets' in raw && typeof raw.targets === 'object' && raw.targets !== null
      ? Object.entries(raw.targets)
      : []
  )

  const derivedTargets: Partial<Record<string, TranslationTarget[]>> = {}
  for (const [gameId, languages] of Object.entries(legacy)) {
    if (!Array.isArray(languages)) continue
    const already = existing.get(gameId)
    if (Array.isArray(already) && already.length > 0) continue

    const tokens = getGame(gameId)?.languageFileToken ?? {}
    const derived = targetsFromLanguages(
      languages.filter((language: unknown) => typeof language === 'string'),
      tokens
    )
    if (derived.length > 0) derivedTargets[gameId] = derived
  }

  if (Object.keys(derivedTargets).length === 0) return {}

  const targets: Partial<Record<string, TranslationTarget[]>> = {}
  for (const [gameId, entry] of existing) {
    if (Array.isArray(entry)) targets[gameId] = entry
  }
  return { targets: { ...targets, ...derivedTargets } }
}

export const migrateSettings = (raw: unknown): SettingsPatch => ({
  ...migrateOverwrite(raw),
  ...migrateTargets(raw)
})

export interface FilterKnownPathsResult {
  entries: KnownPathEntry[]
  droppedCount: number
  migratedCount: number
}

export const foldKnownPath = (platform: NodeJS.Platform, path: string): string =>
  platform === 'linux' ? path : path.toLowerCase()

export const mergeDuplicateKnownPaths = (
  platform: NodeJS.Platform,
  entries: KnownPathEntry[]
): KnownPathEntry[] => {
  const byKey = new Map<string, KnownPathEntry>()
  for (const entry of entries) {
    const key = `${entry.gameId} ${entry.kind} ${foldKnownPath(platform, entry.path)}`
    const existing = byKey.get(key)
    if (!existing) {
      byKey.set(key, entry)
      continue
    }
    const newer = entry.lastUsedAt.localeCompare(existing.lastUsedAt) >= 0 ? entry : existing
    byKey.set(key, { ...newer, pinned: entry.pinned || existing.pinned })
  }
  return [...byKey.values()]
}

const mergeDuplicateKnownPathsOnCurrentPlatform = (entries: KnownPathEntry[]): KnownPathEntry[] =>
  mergeDuplicateKnownPaths(process.platform, entries)

const hasOwnKindField = (item: unknown): boolean =>
  typeof item === 'object' && item !== null && 'kind' in item

export const filterKnownPaths = (raw: unknown): FilterKnownPathsResult => {
  if (!Array.isArray(raw)) return { entries: [], droppedCount: 0, migratedCount: 0 }
  const entries: KnownPathEntry[] = []
  let droppedCount = 0
  let migratedCount = 0
  for (const item of raw) {
    try {
      const parsed = KnownPathEntrySchemaZod.safeParse(item)
      if (parsed.success) {
        entries.push(parsed.data)
        if (!hasOwnKindField(item)) migratedCount++
      } else {
        droppedCount++
      }
    } catch {
      droppedCount++
    }
  }
  return {
    entries: mergeDuplicateKnownPathsOnCurrentPlatform(entries),
    droppedCount,
    migratedCount
  }
}

export const pruneKnownPaths = (entries: KnownPathEntry[]): KnownPathEntry[] => {
  const unpinnedByGameAndKind = new Map<string, KnownPathEntry[]>()
  for (const entry of entries) {
    if (entry.pinned) continue
    const bucketKey = `${entry.gameId} ${entry.kind}`
    const bucket = unpinnedByGameAndKind.get(bucketKey)
    if (bucket) {
      bucket.push(entry)
    } else {
      unpinnedByGameAndKind.set(bucketKey, [entry])
    }
  }

  const toDrop = new Set<KnownPathEntry>()
  for (const bucket of unpinnedByGameAndKind.values()) {
    const oldestFirst = bucket.toSorted((a, b) => a.lastUsedAt.localeCompare(b.lastUsedAt))
    const overflow = Math.max(0, oldestFirst.length - MAX_RECENT_PATHS_PER_GAME)
    for (const entry of oldestFirst.slice(0, overflow)) toDrop.add(entry)
  }

  return entries.filter(entry => entry.pinned || !toDrop.has(entry))
}

export const sameKnownPathOn = (
  platform: NodeJS.Platform,
  entry: KnownPathEntry,
  path: string,
  gameId: string,
  kind: KnownPathKind
): boolean =>
  entry.gameId === gameId &&
  entry.kind === kind &&
  foldKnownPath(platform, canonicalizeCasePreserving(entry.path)) ===
    foldKnownPath(platform, canonicalizeCasePreserving(path))

const sameKnownPath = (
  entry: KnownPathEntry,
  path: string,
  gameId: string,
  kind: KnownPathKind
): boolean => sameKnownPathOn(process.platform, entry, path, gameId, kind)

export const addKnownPathEntryOn = (
  platform: NodeJS.Platform,
  entries: KnownPathEntry[],
  entry: { path: string; gameId: string; kind: KnownPathKind; pinned?: boolean | undefined },
  now: string
): KnownPathEntry[] => {
  const requestedPinned = entry.pinned ?? false
  const existingIndex = entries.findIndex(existing =>
    sameKnownPathOn(platform, existing, entry.path, entry.gameId, entry.kind)
  )
  const updated =
    existingIndex === -1
      ? [
          ...entries,
          {
            path: entry.path,
            gameId: entry.gameId,
            kind: entry.kind,
            lastUsedAt: now,
            pinned: requestedPinned
          }
        ]
      : entries.map((existing, index) =>
          index === existingIndex
            ? { ...existing, lastUsedAt: now, pinned: existing.pinned || requestedPinned }
            : existing
        )
  return pruneKnownPaths(updated)
}

export const addKnownPathEntry = (
  entries: KnownPathEntry[],
  entry: { path: string; gameId: string; kind: KnownPathKind; pinned?: boolean | undefined },
  now: string
): KnownPathEntry[] => addKnownPathEntryOn(process.platform, entries, entry, now)

export const togglePinKnownPathEntry = (
  entries: KnownPathEntry[],
  path: string,
  gameId: string,
  kind: KnownPathKind
): KnownPathEntry[] =>
  entries.map(entry =>
    sameKnownPath(entry, path, gameId, kind) ? { ...entry, pinned: !entry.pinned } : entry
  )

export const removeKnownPathEntry = (
  entries: KnownPathEntry[],
  path: string,
  gameId: string,
  kind: KnownPathKind
): KnownPathEntry[] => entries.filter(entry => !sameKnownPath(entry, path, gameId, kind))

export const clearKnownPathEntries = (
  entries: KnownPathEntry[],
  gameId: string,
  kind: KnownPathKind
): KnownPathEntry[] =>
  entries.filter(entry => entry.gameId !== gameId || entry.kind !== kind || entry.pinned)

export interface SettingsReconciliation {
  repaired: SettingsSchema
  changed: boolean
  logs: string[]
}

export const reconcileSettingsState = (raw: SettingsSchema): SettingsReconciliation => {
  const repaired: SettingsSchema = { ...raw }
  const invalidKeys: string[] = []
  const logs: string[] = []

  for (const key of Object.keys(SettingsSchemaZod.shape)) {
    if (!isSettingsKey(key) || key === 'knownPaths') continue
    if (SettingsSchemaZod.shape[key].safeParse(raw[key]).success) continue
    invalidKeys.push(key)
    resetField(repaired, key)
  }

  const knownPathsWasArray = Array.isArray(raw.knownPaths)
  const { entries: filteredKnownPaths, droppedCount, migratedCount } = filterKnownPaths(
    raw.knownPaths
  )
  const mergedCount = knownPathsWasArray
    ? raw.knownPaths.length - droppedCount - filteredKnownPaths.length
    : 0
  const prunedKnownPaths = pruneKnownPaths(filteredKnownPaths)
  const cappedCount = filteredKnownPaths.length - prunedKnownPaths.length
  let knownPathsChanged = false

  if (!knownPathsWasArray) {
    invalidKeys.push('knownPaths')
    knownPathsChanged = true
  } else {
    if (droppedCount > 0) {
      logs.push(
        `[settings] knownPaths: dropped ${droppedCount} invalid entr${droppedCount === 1 ? 'y' : 'ies'}, ${filteredKnownPaths.length} kept`
      )
      knownPathsChanged = true
    }
    if (mergedCount > 0) {
      logs.push(
        `[settings] knownPaths: merged ${mergedCount} duplicate entr${mergedCount === 1 ? 'y' : 'ies'}`
      )
      knownPathsChanged = true
    }
    if (migratedCount > 0) {
      logs.push(
        `[settings] knownPaths: migrated ${migratedCount} entr${migratedCount === 1 ? 'y' : 'ies'} without a kind to modFolder`
      )
      knownPathsChanged = true
    }
    if (cappedCount > 0) {
      logs.push(
        `[settings] knownPaths: capped ${cappedCount} entr${cappedCount === 1 ? 'y' : 'ies'} over the per-game recent limit`
      )
      knownPathsChanged = true
    }
  }
  if (knownPathsChanged) repaired.knownPaths = prunedKnownPaths

  const changed = invalidKeys.length > 0 || knownPathsChanged
  if (invalidKeys.length > 0) {
    logs.push(`[settings] invalid setting(s) reset to defaults: ${invalidKeys.join(', ')}`)
  }

  return { repaired, changed, logs }
}

export class SettingsService {
  private store: Store<SettingsSchema>

  constructor() {
    this.store = new Store<SettingsSchema>({
      name: 'settings',
      defaults: DEFAULTS
    })
    this.migrateLegacyKeys()
    this.ensureValidStore()
  }

  getAll(): SettingsSchema {
    return this.store.store
  }

  update(patch: SettingsPatch): SettingsSchema {
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue
      this.store.set(key as keyof SettingsSchema, value as never)
    }
    return this.store.store
  }

  reset(): SettingsSchema {
    this.store.clear()
    this.store.store = DEFAULTS
    return this.store.store
  }

  /** Caller is responsible for canonicalising; this method just dedupes. */
  addAllowedFolder(canonicalPath: string): SettingsSchema {
    const current = this.store.get('userAllowedFolders')
    if (current.includes(canonicalPath)) return this.store.store
    this.store.set('userAllowedFolders', [...current, canonicalPath])
    return this.store.store
  }

  addKnownPath(entry: {
    path: string
    gameId: string
    kind: KnownPathKind
    pinned?: boolean | undefined
  }): SettingsSchema {
    const current = this.store.get('knownPaths')
    this.store.set('knownPaths', addKnownPathEntry(current, entry, new Date().toISOString()))
    return this.store.store
  }

  togglePinKnownPath(path: string, gameId: string, kind: KnownPathKind): SettingsSchema {
    const current = this.store.get('knownPaths')
    this.store.set('knownPaths', togglePinKnownPathEntry(current, path, gameId, kind))
    return this.store.store
  }

  removeKnownPath(path: string, gameId: string, kind: KnownPathKind): SettingsSchema {
    const current = this.store.get('knownPaths')
    this.store.set('knownPaths', removeKnownPathEntry(current, path, gameId, kind))
    return this.store.store
  }

  clearKnownPaths(gameId: string, kind: KnownPathKind): SettingsSchema {
    const current = this.store.get('knownPaths')
    this.store.set('knownPaths', clearKnownPathEntries(current, gameId, kind))
    return this.store.store
  }

  private migrateLegacyKeys(): void {
    const raw = this.store.store
    this.update(migrateSettings(raw))
    if ('overwrite' in raw) {
      const legacy: LegacyKeyStore = this.store
      legacy.delete('overwrite')
    }
  }

  private ensureValidStore(): void {
    const { repaired, changed, logs } = reconcileSettingsState(this.store.store)
    for (const message of logs) log.warn(message)
    if (!changed) return
    this.store.store = repaired
  }
}

const isSettingsKey = (key: string): key is keyof SettingsSchema => key in DEFAULTS

const resetField = <K extends keyof SettingsSchema>(target: SettingsSchema, key: K): void => {
  target[key] = structuredClone(DEFAULTS[key])
}
