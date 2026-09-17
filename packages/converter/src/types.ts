import type { GameDefinition, LanguageCode, TargetContent, TranslationTarget } from '@ptt/shared'

import type { ModDiagnostic } from './diagnostics.js'

export type { FsDirEntry, FsLike } from '@ptt/shared'

export type GameContextRef = Pick<
  GameDefinition,
  'languageFileToken' | 'localisationDirName' | 'overrideSubdirs'
>

export interface ModFolder {
  id: string
  path: string
}

export interface DiscoveredMods {
  mods: ModFolder[]
  single: boolean
}

export interface LocalisationFilePath {
  path: string
  locIndex: number
  rest: string[]
}

export interface ModFilesResult {
  files: LocalisationFilePath[]
  otherSpelling: boolean
  diagnostics: ModDiagnostic[]
}

export interface Descriptor {
  name?: string
  supportedVersion?: string
  remoteFileId?: string
  dependencies?: string[]
}

export interface LocalisationEntry {
  key: string
  file: string
  described: LocalisationFilePath
  token: string
  language?: LanguageCode
  value: string
}

export interface ModEntries {
  files: number
  entries: LocalisationEntry[]
  otherSpelling: boolean
  diagnostics: ModDiagnostic[]
  truncated: boolean
}

export interface ModKeys {
  files: number
  byLanguage: Map<LanguageCode, Map<string, LocalisationEntry>>
  otherSpelling: boolean
  diagnostics: ModDiagnostic[]
  truncated: boolean
}

export interface Coverage {
  byLanguage: Map<LanguageCode, Set<string>>
  sources: string[]
}

export interface GeneratedEntry {
  value: string
  file: string
}

export interface GeneratedMod {
  path: string
  byNamespace: Map<string, Map<string, Map<string, GeneratedEntry>>>
}

export interface GeneratedModSummary {
  path: string
  translated: number
  english: number
  kept: number
  shadowed: number
  orphanNamespaces: string[]
}

export type KeyState = 'own' | 'patch' | 'generated' | 'english' | 'kept' | 'missing'

export interface KeyReport {
  modId: string
  modName: string
  language: string
  key: string
  file: string
  source: string
  state: KeyState
  fileToken?: string
  provider?: string
  reason?: string
  markupOnly?: boolean
  shadowed?: boolean
  identicalToSource?: boolean
  ownSource?: boolean
}

export interface CreationJob {
  source: string
  target: string
  packed: string[]
  keys: Map<string, string>
  known: Map<string, string>
  content: TargetContent
}

export interface ModPlan {
  name: string
  namespace: string
  otherSpelling: boolean
  sourceKeys: number
  supportedVersion?: string
  localisationFiles: number
  sourceFiles: number
  targetLanguages: string[]
  jobs: Partial<Record<string, CreationJob[]>>
  covered: Partial<Record<string, number>>
  english: Partial<Record<string, number>>
  kept: Partial<Record<string, number>>
  shadowed: Partial<Record<string, number>>
  keyStates: KeyReport[]
  errors: string[]
  warnings: string[]
}

export interface TranslationMemoryPort {
  get(language: string, value: string): string | undefined
}

export interface KeyPlanOptions {
  gameDef: GameContextRef
  sourceLanguage: LanguageCode
  targets: readonly TranslationTarget[]
  packed: boolean
  coverage?: Coverage
  generated?: GeneratedMod
  memory?: TranslationMemoryPort
  detail?: boolean
  targetContent?: TargetContent
  retranslateOwnKeys?: boolean
}

export interface ScannedMod {
  id: string
  name: string
  path: string
  localisationFiles: number
  sourceFiles: number
  sourceKeys: number
  otherSpelling: boolean
  coveredBy: string[]
  missing: Partial<Record<string, number>>
  missingKeys: Partial<Record<string, number>>
  coveredKeys: Partial<Record<string, number>>
  englishKeys: Partial<Record<string, number>>
  keptKeys: Partial<Record<string, number>>
  shadowedKeys: Partial<Record<string, number>>
  missingFiles: number
  missingLines: number
  supportedVersion?: string
  errors: string[]
  warnings?: string[]
}

export interface ScanTotals {
  mods: number
  missingFiles: number
  missingLines: number
  withoutLocalisation: number
  otherSpelling: number
  coveredKeys: number
  englishKeys: number
  keptKeys: number
  shadowedKeys: number
}

export interface ScanOutput {
  mods: ScannedMod[]
  targets: readonly TranslationTarget[]
  totals: ScanTotals
  selfCopy?: string
  generatedMod?: GeneratedModSummary
  keyStates?: KeyReport[]
}

export interface TranslationMod {
  name: string
  folder: string
  path: string
  supportedVersion: string
}

export type Destination =
  | { kind: 'in-place' }
  | { kind: 'output-dir'; outputDir: string }
  | { kind: 'translation-mod'; mod: TranslationMod }

export interface ApplyModOptions {
  plan: ModPlan
  mod: ModFolder
  gameDef: GameContextRef
  sourceLanguage: LanguageCode
  targets: readonly TranslationTarget[]
  destination: Destination
  translations?: Map<string, Map<string, string>>
  isCancelled?: () => boolean
  onFileWritten?: (path: string) => void
}

export interface ModResult {
  id: string
  name: string
  path: string
  localisationFiles: number
  sourceFiles: number
  createdCount: number
  skippedCount: number
  unchangedCount: number
  failedCount: number
  prunedCount: number
  created: Partial<Record<string, string[]>>
  supportedVersion?: string
  translation?: { translated: number; cached: number; failed: number }
  errors: string[]
  warnings?: string[]
}

export interface ConversionTotals {
  mods: number
  modsWithFiles: number
  created: number
  skipped: number
  unchanged: number
  failed: number
  pruned: number
  errors: number
}

export interface ConversionOutput {
  mods: ModResult[]
  targets: readonly TranslationTarget[]
  translationMod?: TranslationMod
  translation?: { translated: number; cached: number; failed: number }
  cancelled?: boolean
  reportPath?: string
  reportFile?: string
  totals: ConversionTotals
}
