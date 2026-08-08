import { z } from 'zod'

export const LANGUAGE_CODES = [
  'en',
  'fr',
  'de',
  'es',
  'pl',
  'pt-BR',
  'ru',
  'zh-Hans',
  'ko',
  'ja',
  'tr'
] as const

export const LanguageCodeSchema = z.enum(LANGUAGE_CODES)

export type LanguageCode = (typeof LANGUAGE_CODES)[number]

export interface GameSummary {
  id: string
  displayName: string
  steamAppId?: number
  languages: ReadonlyArray<LanguageCode>
}

export interface GameDefinition {
  id: string
  displayName: string
  steamAppId?: number
  localisationDirName: 'localisation' | 'localization'
  layout: 'flat' | 'nested-by-language' | 'both'
  languageFileToken: Partial<Record<LanguageCode, string>>
  overrideSubdirs: string[]
  /**
   * Folder name under `Documents/Paradox Interactive` holding the user mods.
   * A wrong value writes the generated translation mod where no launcher looks.
   */
  userFolder: string
  /**
   * What the game is about, handed to the translator.
   * Without it a translator has no idea that CK3 "Wroth" is a character trait and
   * renders it as the noun "anger" instead of the adjective the game uses.
   */
  domain: string
}

/**
 * What a run does with the files it generates.
 *
 * `create-translation-mod` was a disabled button before PR #4 by Artem Kondrashev: every mod's
 * missing keys are gathered into one mod under the game user folder, namespaced per source mod.
 */
export const CONVERT_MODES = [
  'add-to-current',
  'extract-to-folder',
  'create-translation-mod'
] as const

export const ConvertModeSchema = z.enum(CONVERT_MODES)

/** Derived from the tuple, so the union and the schema can never drift apart. */
export type ConvertMode = (typeof CONVERT_MODES)[number]

export { IPC_CHANNELS, type IpcChannel } from './ipc-channels.js'
