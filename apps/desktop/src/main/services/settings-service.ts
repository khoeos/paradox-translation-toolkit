import Store from 'electron-store'
import { z } from 'zod'

import { getAllGameIds } from '@ptt/games'
import { DEFAULT_UI_LANGUAGE, VALID_UI_LANGUAGES, type UiLanguage } from '@ptt/i18n'
import {
  ConvertModeSchema,
  LanguageCodeSchema,
  TargetContentSchema,
  type ConvertMode,
  type LanguageCode,
  type TargetContent
} from '@ptt/shared'

import { log } from '../log.js'

const GameIdSchema = z.enum(getAllGameIds())

export type UpdateChannel = 'stable' | 'beta'

export interface SettingsSchema {
  lastModFolder: Partial<Record<string, string>>
  lastOutputFolder: Partial<Record<string, string>>
  gamePath: Partial<Record<string, string>>
  defaultSourceLanguage: LanguageCode
  sourceLanguage: Partial<Record<string, LanguageCode>>
  targetLanguages: Partial<Record<string, LanguageCode[]>>
  mode: ConvertMode
  targetContent: TargetContent
  themeOverride: 'system' | 'light' | 'dark'
  uiLanguage: UiLanguage
  lastGameId: string | null
  autoCheckUpdates: boolean
  updateChannel: UpdateChannel
  userAllowedFolders: string[]
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
  mode: 'add-to-current',
  targetContent: 'missing-keys',
  themeOverride: 'system',
  uiLanguage: DEFAULT_UI_LANGUAGE,
  lastGameId: null,
  autoCheckUpdates: true,
  updateChannel: 'stable',
  userAllowedFolders: []
}

export const SettingsSchemaZod = z.object({
  lastModFolder: z.partialRecord(GameIdSchema, z.string()),
  lastOutputFolder: z.partialRecord(GameIdSchema, z.string()),
  gamePath: z.partialRecord(GameIdSchema, z.string()),
  defaultSourceLanguage: LanguageCodeSchema,
  sourceLanguage: z.partialRecord(GameIdSchema, LanguageCodeSchema),
  targetLanguages: z.partialRecord(GameIdSchema, z.array(LanguageCodeSchema)),
  mode: ConvertModeSchema,
  targetContent: TargetContentSchema,
  themeOverride: z.enum(['system', 'light', 'dark']),
  uiLanguage: z.enum(VALID_UI_LANGUAGES),
  lastGameId: GameIdSchema.nullable(),
  autoCheckUpdates: z.boolean(),
  updateChannel: z.enum(['stable', 'beta']),
  userAllowedFolders: z.array(z.string())
})

interface LegacyKeyStore {
  delete(key: string): void
}

export const migrateSettings = (raw: unknown): SettingsPatch => {
  if (typeof raw !== 'object' || raw === null || !('overwrite' in raw)) return {}
  const legacy = raw.overwrite
  if (typeof legacy !== 'boolean') return {}
  return { targetContent: legacy ? 'complete-file' : 'missing-keys' }
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

  private migrateLegacyKeys(): void {
    const raw = this.store.store
    this.update(migrateSettings(raw))
    if ('overwrite' in raw) {
      const legacy: LegacyKeyStore = this.store
      legacy.delete('overwrite')
    }
  }

  private ensureValidStore(): void {
    const raw = this.store.store
    const repaired: SettingsSchema = { ...raw }
    const invalidKeys: string[] = []

    for (const key of Object.keys(SettingsSchemaZod.shape)) {
      if (!isSettingsKey(key)) continue
      if (SettingsSchemaZod.shape[key].safeParse(raw[key]).success) continue
      invalidKeys.push(key)
      resetField(repaired, key)
    }

    if (invalidKeys.length === 0) return
    log.warn(`[settings] invalid setting(s) reset to defaults: ${invalidKeys.join(', ')}`)
    this.store.store = repaired
  }
}

const isSettingsKey = (key: string): key is keyof SettingsSchema => key in DEFAULTS

const resetField = <K extends keyof SettingsSchema>(target: SettingsSchema, key: K): void => {
  target[key] = DEFAULTS[key]
}
