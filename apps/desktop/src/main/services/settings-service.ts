import Store from 'electron-store'
import { z } from 'zod'

import { getAllGameIds } from '@ptt/game-registry'
import { DEFAULT_UI_LANGUAGE, VALID_UI_LANGUAGES, type UiLanguage } from '@ptt/i18n'
import { LanguageCodeSchema, type ConvertMode, type LanguageCode } from '@ptt/shared-types'

import { log } from '../log.js'

const GameIdSchema = z.enum(getAllGameIds())

export type UpdateChannel = 'stable' | 'beta'

export interface SettingsSchema {
  // Per-game records are sparse, hence `Partial<...>` to match the
  // `z.partialRecord` IPC patch schema.
  lastModFolder: Partial<Record<string, string>>
  lastOutputFolder: Partial<Record<string, string>>
  defaultSourceLanguage: LanguageCode
  sourceLanguage: Partial<Record<string, LanguageCode>>
  targetLanguages: Partial<Record<string, LanguageCode[]>>
  mode: ConvertMode
  overwrite: boolean
  themeOverride: 'system' | 'light' | 'dark'
  uiLanguage: UiLanguage
  lastGameId: string | null
  autoCheckUpdates: boolean
  updateChannel: UpdateChannel
  /** Canonical paths approved via the "Authorize folder" modal, persisted. */
  userAllowedFolders: string[]
}

export type SettingsPatch = {
  [K in keyof SettingsSchema]?: SettingsSchema[K] | undefined
}

const DEFAULTS: SettingsSchema = {
  lastModFolder: {},
  lastOutputFolder: {},
  defaultSourceLanguage: 'en',
  sourceLanguage: {},
  targetLanguages: {},
  mode: 'add-to-current',
  overwrite: false,
  themeOverride: 'system',
  uiLanguage: DEFAULT_UI_LANGUAGE,
  lastGameId: null,
  autoCheckUpdates: true,
  updateChannel: 'stable',
  userAllowedFolders: []
}

// Validate the raw store on load; falls back to defaults rather than crashing.
// `z.partialRecord` is required: zod v4's `z.record` enforces every key.
const SettingsSchemaZod = z.object({
  lastModFolder: z.partialRecord(GameIdSchema, z.string()),
  lastOutputFolder: z.partialRecord(GameIdSchema, z.string()),
  defaultSourceLanguage: LanguageCodeSchema,
  sourceLanguage: z.partialRecord(GameIdSchema, LanguageCodeSchema),
  targetLanguages: z.partialRecord(GameIdSchema, z.array(LanguageCodeSchema)),
  mode: z.enum(['add-to-current', 'extract-to-folder']),
  overwrite: z.boolean(),
  themeOverride: z.enum(['system', 'light', 'dark']),
  uiLanguage: z.enum(VALID_UI_LANGUAGES),
  lastGameId: GameIdSchema.nullable(),
  autoCheckUpdates: z.boolean(),
  updateChannel: z.enum(['stable', 'beta']),
  userAllowedFolders: z.array(z.string())
})

export class SettingsService {
  private store: Store<SettingsSchema>

  constructor() {
    this.store = new Store<SettingsSchema>({
      name: 'settings',
      defaults: DEFAULTS
    })
    // Validate once at boot so a corrupted file doesn't bubble up later.
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

  private ensureValidStore(): void {
    const parsed = SettingsSchemaZod.safeParse(this.store.store)
    if (parsed.success) return
    log.warn(
      '[settings] settings.json failed validation, resetting to defaults:',
      parsed.error.message
    )
    this.store.clear()
    this.store.store = DEFAULTS
  }
}
