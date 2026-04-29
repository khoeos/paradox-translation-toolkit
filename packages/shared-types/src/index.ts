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
}

export type ConvertMode = 'add-to-current' | 'extract-to-folder'

export { IPC_CHANNELS, type IpcChannel } from './ipc-channels.js'
