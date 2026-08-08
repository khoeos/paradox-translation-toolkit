import type { ConvertMode, GameDefinition, LanguageCode } from '@ptt/shared-types'

export interface FsDirEntry {
  name: string
  isDirectory: boolean
  isFile: boolean
  isSymlink: boolean
}

export interface FsLike {
  readFile(path: string, encoding: 'utf-8'): Promise<string>
  writeFile(path: string, data: string, encoding: 'utf-8'): Promise<void>
  rename(from: string, to: string): Promise<void>
  copyFile(from: string, to: string): Promise<void>
  unlink(path: string): Promise<void>
  readdir(path: string): Promise<FsDirEntry[]>
  mkdir(path: string, opts: { recursive: true }): Promise<void>
  stat(path: string): Promise<{ isDirectory: boolean; isFile: boolean; size: number }>
  exists(path: string): Promise<boolean>
}

/**
 * The subset of `GameDefinition` this package consumes. Narrowed on purpose: a field
 * that only the Electron or CLI caller needs (`userFolder`) or that only the translator
 * needs (`domain`) must not ripple into every converter-core fixture.
 */
export type GameContextRef = Pick<
  GameDefinition,
  'languageFileToken' | 'localisationDirName' | 'overrideSubdirs'
>

export interface DiscoveredFile {
  absolutePath: string
  relativePath: string
  modRoot: string
  language: LanguageCode
  languageToken: string
  canonicalKey: string
  isInOverrideDir: boolean
}

export interface ScanResult {
  rootDir: string
  files: DiscoveredFile[]
  diagnostics: string[]
}

export interface DiffPlan {
  sourceLanguage: LanguageCode
  targetLanguages: LanguageCode[]
  missingFiles: Partial<Record<LanguageCode, DiscoveredFile[]>>
}

export interface DiffOptions {
  overwrite?: boolean
}

export interface CopyAction {
  sourcePath: string
  targetPath: string
  sandboxRoot: string
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  sourceLanguageToken: string
  targetLanguageToken: string
}

export interface CopyPlan {
  mode: ConvertMode
  outputDir?: string
  actions: CopyAction[]
}

export interface ApplyReport {
  created: Partial<Record<LanguageCode, string[]>>
  overwritten: Partial<Record<LanguageCode, string[]>>
  failed: Partial<Record<LanguageCode, { path: string; error: string }[]>>
}

export interface ApplyOptions {
  overwrite?: boolean
  onProgress?: (event: ProgressEvent) => void
}

export type ProgressEvent =
  | { type: 'apply-progress'; processed: number; total: number }
  | { type: 'scan-progress'; processed: number; total: number }

/*
 * Mod-level pipeline. Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts` and
 * `src/global/types.ts`) by Artem Kondrashev.
 */

/** One candidate mod: a folder, and the id it is known by (its folder name). */
export interface ModFolder {
  id: string
  path: string
}

export interface DiscoveredMods {
  mods: ModFolder[]
  /** The selected folder is itself the mod, rather than a collection of mods. */
  single: boolean
}

/** A .yml file located inside a localisation folder. */
export interface LocalisationFilePath {
  path: string
  /** Index of the localisation segment in the split path. */
  locIndex: number
  /** Path segments after the localisation folder, last one being the file name. */
  rest: string[]
}

export interface ModFilesResult {
  files: LocalisationFilePath[]
  /** A localisation folder spelled the other way was found: wrong game selected? */
  otherSpelling: boolean
  diagnostics: string[]
}

/** What we read from a mod descriptor (`.mod`). */
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
  language: LanguageCode
  /** The value, needed to tell a real translation from a copied source string. */
  value: string
}

/** Every entry a mod declares, in file order, nothing deduplicated. */
export interface ModEntries {
  files: number
  entries: LocalisationEntry[]
  otherSpelling: boolean
  diagnostics: string[]
}

export interface ModKeys {
  files: number
  byLanguage: Map<LanguageCode, Map<string, LocalisationEntry>>
  otherSpelling: boolean
  diagnostics: string[]
}

export interface Coverage {
  byLanguage: Map<LanguageCode, Set<string>>
  /** Names of the mods providing the coverage, shown so the user can see who covers what. */
  sources: string[]
}

/** One key our own generated mod already holds. */
export interface GeneratedEntry {
  value: string
  file: string
}

/** What a previous run of this tool left in the game user folder. */
export interface GeneratedMod {
  path: string
  /** Namespace to language to key, the namespace naming the source mod. */
  byNamespace: Map<string, Map<LanguageCode, Map<string, GeneratedEntry>>>
}

export interface GeneratedModSummary {
  path: string
  /** Keys it supplies a real translation for. */
  translated: number
  /** Keys it holds in the source language: they will be tried again. */
  english: number
  /** Keys it holds unchanged because that is what the backend answered. */
  kept: number
  /** Keys it hides behind its own copy while a real translation for them exists. */
  shadowed: number
  /** Namespaces that no longer match any scanned mod. */
  orphanNamespaces: string[]
}

/**
 * State of one source key in one target language.
 *
 * `english` versus `kept` is the distinction that needs the translation memory: only it knows
 * whether the backend ever answered, and answered with the source text itself.
 */
export type KeyState =
  /** The mod ships the translation itself. */
  | 'own'
  /** A separate localisation mod supplies it. */
  | 'patch'
  /** Our own generated mod supplies a real translation. */
  | 'generated'
  /** Our own generated mod holds it, still in the source language: a refused string. */
  | 'english'
  /** Our generated mod holds the source text and the memory says the backend answered that. */
  | 'kept'
  /** Nobody translated it and nothing was generated for it. */
  | 'missing'

export interface KeyReport {
  modId: string
  modName: string
  language: LanguageCode
  key: string
  /** Source file the key is declared in. */
  file: string
  /** Value in the source language. */
  source: string
  state: KeyState
  /** Who supplies the current value: a mod name, or the generated file. */
  provider?: string
  /** Why the translator left it alone, only filled by a run report. */
  reason?: string
  /** Markup or numbers only: nothing here is ever sent to a translator. */
  markupOnly?: boolean
  /**
   * Our generated mod also holds this key while somebody else translates it. The generated
   * mod loads last, so its value is the one the game shows: the real translation is hidden
   * until the next run drops the key.
   */
  shadowed?: boolean
}

/** One target file to create for one mod and one language. */
export interface CreationJob {
  source: string
  target: string
  /** Path below the language folder, used when packing into a translation mod. */
  packed: string[]
  /**
   * Every key the target file must hold, mapped to its source value. Keys somebody else
   * already translated are not in here: writing them would shadow their work.
   */
  keys: Map<string, string>
  /**
   * Of those keys, the ones an earlier run of ours already translated, mapped to that
   * translation. The generated file is rewritten whole on every run, so they have to be
   * carried over, and none of them is ever sent to a translator twice.
   */
  known: Map<string, string>
}

/** What a mod needs, computed once and reused by the scan and the conversion. */
export interface ModPlan {
  name: string
  /** Folder this mod owns inside the generated translation mod. */
  namespace: string
  otherSpelling: boolean
  /** Total keys the source language declares. */
  sourceKeys: number
  supportedVersion?: string
  localisationFiles: number
  sourceFiles: number
  /** Files to create, per target language. */
  jobs: Partial<Record<LanguageCode, CreationJob[]>>
  /** Keys already translated by anyone, per target language. */
  covered: Partial<Record<LanguageCode, number>>
  /** Keys our own generated mod holds in the source language, per target language. */
  english: Partial<Record<LanguageCode, number>>
  /** Keys the backend answered with the source text itself, per target language. */
  kept: Partial<Record<LanguageCode, number>>
  /** Keys our own generated mod holds although somebody else translates them. */
  shadowed: Partial<Record<LanguageCode, number>>
  /** Key by key state, only filled when the caller asked for the detail. */
  keyStates: KeyReport[]
  errors: string[]
}

/**
 * The translation memory, as seen from here.
 *
 * A port rather than the class: `converter-core` must not depend on the translation
 * subsystem, and the key plan only ever asks it one question.
 */
export interface TranslationMemoryPort {
  get(language: LanguageCode, value: string): string | undefined
}

export interface KeyPlanOptions {
  gameDef: GameContextRef
  sourceLanguage: LanguageCode
  targetLanguages: readonly LanguageCode[]
  /** Also compute the paths used inside a translation mod. */
  packed: boolean
  coverage?: Coverage
  /** What an earlier run already wrote, so its output is not generated a second time. */
  generated?: GeneratedMod
  /**
   * The translation memory, already loaded for the target languages. It is the only way to
   * tell a string the backend refused from one it answered with the source text.
   */
  memory?: TranslationMemoryPort
  /** Collect the state of every key, which costs memory on a large collection. */
  detail?: boolean
}

export interface ScannedMod {
  id: string
  name: string
  path: string
  localisationFiles: number
  sourceFiles: number
  /** Total keys the source language declares. */
  sourceKeys: number
  /** A localisation folder spelled the other way exists here: wrong game selected. */
  otherSpelling: boolean
  /** Localisation mods supplying part of this one's translation. */
  coveredBy: string[]
  /** Missing files per target language. */
  missing: Partial<Record<LanguageCode, number>>
  /** Keys still untranslated, per target language. */
  missingKeys: Partial<Record<LanguageCode, number>>
  /** Keys already translated by anyone, our own generated mod included. */
  coveredKeys: Partial<Record<LanguageCode, number>>
  /**
   * Keys our own generated mod holds but left in the source language. Counted as missing, not
   * as covered: a previous run refused them and the next one has to try again.
   */
  englishKeys: Partial<Record<LanguageCode, number>>
  /**
   * Keys the backend answered with the source text itself. Proper names mostly: they read as
   * untranslated but retrying them costs money for nothing.
   */
  keptKeys: Partial<Record<LanguageCode, number>>
  /**
   * Keys our generated mod holds although somebody else translates them. Our mod loads last,
   * so these hide a real translation until the next run.
   */
  shadowedKeys: Partial<Record<LanguageCode, number>>
  missingFiles: number
  /** Translatable lines inside the missing files, drives the time estimate. */
  missingLines: number
  supportedVersion?: string
  errors: string[]
}

export interface ScanTotals {
  mods: number
  missingFiles: number
  missingLines: number
  /** Mods holding no localisation folder for the selected game. */
  withoutLocalisation: number
  /** Mods where the other spelling was found instead. */
  otherSpelling: number
  coveredKeys: number
  englishKeys: number
  keptKeys: number
  shadowedKeys: number
}

export interface ScanOutput {
  mods: ScannedMod[]
  totals: ScanTotals
  /**
   * A copy of the generated mod found inside the scanned folder. It was left out of the scan:
   * our own output must never vouch for itself.
   */
  selfCopy?: string
  generatedMod?: GeneratedModSummary
  /** State of every key, only when the caller asked for the detail. */
  keyStates?: KeyReport[]
}

/** The generated mod, described once and reused by both descriptors. */
export interface TranslationMod {
  /** Name shown in the game launcher. */
  name: string
  /** Folder name below the game mod directory. */
  folder: string
  /** Path of the mod folder. */
  path: string
  supportedVersion: string
}

/** Where the generated files of a run go. */
export type Destination =
  /** Beside the source files, inside each mod. Never overwrites an existing translation. */
  | { kind: 'in-place' }
  /** Into a folder of the user's choosing, one subfolder per source mod. */
  | { kind: 'output-dir'; outputDir: string }
  /** Into one generated mod under the game user folder, namespaced per source mod. */
  | { kind: 'translation-mod'; mod: TranslationMod }

export interface ApplyModOptions {
  plan: ModPlan
  mod: ModFolder
  gameDef: GameContextRef
  sourceLanguage: LanguageCode
  /**
   * Every language the run asked for, not only the ones that ended up with files to write: a
   * language whose keys are all covered now has nothing to write and everything to prune.
   */
  targetLanguages: readonly LanguageCode[]
  destination: Destination
  /**
   * Target language to source-value-to-translation. Handed in rather than produced here: the
   * translation backend lives outside this package.
   */
  translations?: Map<LanguageCode, Map<string, string>>
  /** Consulted between languages, so a stop never leaves a half-written file. */
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
  /** Blocked by an existing file we must not touch. */
  skippedCount: number
  /** Already correct in the generated mod, so not rewritten. */
  unchangedCount: number
  failedCount: number
  /** Files removed from the generated mod because nothing needs them any more. */
  prunedCount: number
  /** Created files per language. */
  created: Partial<Record<LanguageCode, string[]>>
  /** supported_version declared by the mod, reused for the generated translation mod. */
  supportedVersion?: string
  /** What the translator did for this mod alone, for reading a run back mod by mod. */
  translation?: { translated: number; cached: number; failed: number }
  errors: string[]
}

export interface ConversionTotals {
  mods: number
  modsWithFiles: number
  created: number
  skipped: number
  unchanged: number
  failed: number
  /** Generated files removed because nothing needs them any more. */
  pruned: number
  errors: number
}

export interface ConversionOutput {
  mods: ModResult[]
  translationMod?: TranslationMod
  translation?: { translated: number; cached: number; failed: number }
  cancelled?: boolean
  /** Where the key-by-key report of this run was written. */
  reportPath?: string
  totals: ConversionTotals
}
