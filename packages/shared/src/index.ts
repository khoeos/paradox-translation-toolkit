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
  userFolder: string
  domain: string
}

export const CONVERT_MODES = [
  'add-to-current',
  'extract-to-folder',
  'create-translation-mod'
] as const

export const ConvertModeSchema = z.enum(CONVERT_MODES)

export type ConvertMode = (typeof CONVERT_MODES)[number]

export const TARGET_CONTENTS = ['missing-keys', 'complete-file', 'regenerate-file'] as const

export const TargetContentSchema = z.enum(TARGET_CONTENTS)

export type TargetContent = (typeof TARGET_CONTENTS)[number]
export { IPC_CHANNELS, type IpcChannel } from './ipc-channels.js'
export type { FsDirEntry, FsLike, FetchLike, FetchInit, FetchResponse } from './ports.js'
