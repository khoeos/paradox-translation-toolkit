import { z } from 'zod'

import { FILE_TOKEN_MAX, isFileToken, isLanguageLabel, LANGUAGE_CODES } from './languages.js'
import type { LanguageCode } from './languages.js'

export {
  LANGUAGE_CODES,
  isLanguageCode,
  FILE_TOKEN_MAX,
  normalizeFileToken,
  isFileToken,
  gameTokenOwner,
  usesOwnToken,
  shadowedLanguageOf,
  builtInTargetFor,
  isGameToken,
  findTargetListProblem,
  LANGUAGE_LABEL_MAX,
  isLanguageLabel,
  LANGUAGE_DISPLAY_NAMES,
  getTargetLanguageCode,
  getTargetLanguageKey,
  normalizeTargetLanguage,
  normalizeTargets,
  uniqueTargetLanguages,
  targetsFromLanguages,
  getLanguageDisplayName,
  findUnrecognizedTarget,
  findNothingToWriteTarget,
  describeTargetListProblem
} from './languages.js'
export type { LanguageCode, TranslationTarget, GameTokens, TargetListProblem } from './languages.js'

export const LanguageCodeSchema = z.enum(LANGUAGE_CODES)

export const TranslationTargetSchema = z.object({
  language: z.string().refine(isLanguageLabel),
  fileToken: z.string().min(1).max(FILE_TOKEN_MAX).refine(isFileToken)
})

export interface GameSummary {
  id: string
  displayName: string
  steamAppId?: number
  languages: ReadonlyArray<LanguageCode>
  languageFileToken: Partial<Record<LanguageCode, string>>
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
export type {
  FsDirEntry,
  FsLike,
  FetchLike,
  FetchInit,
  FetchResponse,
  RegistryHive,
  RegistryLike
} from './ports.js'
