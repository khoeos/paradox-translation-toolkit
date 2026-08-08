export enum IpcKey {
  CONVERT_START = 'startConversion',
  CONVERT_STATUS = 'conversionStatus',
  CONVERT_CANCEL = 'cancelConversion',
  SCAN_START = 'startScan',
  SELECT_FOLDER_START = 'startSelectFolder',
  SELECT_FOLDER_RESULT = 'folderSelected',
  SELECT_OUTPUT_START = 'startSelectOutput',
  SELECT_OUTPUT_RESULT = 'outputSelected',
  SELECT_GAME_START = 'startSelectGame',
  SELECT_GAME_RESULT = 'gameSelected',
  OPEN_FOLDER = 'openFolder',
  TEST_PROVIDER = 'testProvider',
  TEST_PROVIDER_RESULT = 'testProviderResult',
  CLEAR_MEMORY = 'clearMemory',
  CLEAR_MEMORY_RESULT = 'clearMemoryResult'
}

/** What the worker was asked to do */
export enum WorkerAction {
  SCAN = 'scan',
  CONVERT = 'convert'
}

export enum TranslateProvider {
  OLLAMA = 'ollama',
  OPENAI = 'openai',
  RAPIDAPI = 'rapidapi'
}

/** Everything the translation engine needs, all of it user editable */
export interface TranslateConfig {
  enabled: boolean
  provider: TranslateProvider
  baseUrl: string
  model: string
  apiKey?: string
  /** Strings sent per request */
  batchSize: number
  /** Requests in flight at once */
  concurrency: number
  /** Attempts before a batch is split */
  retries: number
  /** Per request timeout in milliseconds */
  timeout: number
  /** What the game is about, filled in by the worker from the selected game */
  domain?: string
  /** Game installation folder, its own localisation is the best glossary there is */
  gamePath?: string
}

export enum ConversionStatusType {
  LOG,
  STATUS,
  PROGRESS
}

export enum ConversionLogMessage {
  STARTING = 'conversionLog.starting',
  DONE = 'conversionLog.done',
  SINGLE_MOD = 'conversionLog.singleMod',
  MODS_FOUND = 'conversionLog.modsFound',
  SUMMARY = 'conversionLog.summary',
  MOD_CREATED = 'conversionLog.modCreated',
  TRANSLATING = 'conversionLog.translating',
  GLOSSARY = 'conversionLog.glossary',
  SELF_COPY = 'conversionLog.selfCopy',
  CANCELLED = 'conversionLog.cancelled'
}

export enum ConversionStatus {
  WAITING,
  STARTED,
  SCANNING_FILES,
  COMPARING_FILES,
  WAITING_USER_INPUT,
  CREATING_FILES,
  FINISHED,
  ERROR,
  PROCESSING_MODS,
  SCAN_FINISHED,
  CANCELLED
}

export enum ConvertMode {
  ADD_TO_CURRENT = 0,
  EXTRACT_TO_FOLDER = 1,
  CREATE_TRANSLATION_MOD = 2
}

/** Values passed to i18next for interpolation in a log line */
export type LogValues = Record<string, string | number>

export interface ConversionLog {
  type: ConversionStatusType.LOG
  ts: number
  message: string
  values?: LogValues
}

/** Emitted once per finished mod so the UI can show a real progress bar */
export interface ConversionProgress {
  type: ConversionStatusType.PROGRESS
  current: number
  total: number
  modName: string
  /** Set while translating, counts strings rather than mods */
  translation?: TranslationCounters
}

// A type alias, not an interface: i18next needs an implicit index signature to interpolate it
export type TranslationCounters = {
  translated: number
  cached: number
  failed: number
}

/** Where the current value of a localisation key comes from */
export enum KeyState {
  /** The mod ships the translation itself */
  OWN = 'own',
  /** A separate localisation mod supplies it */
  PATCH = 'patch',
  /** Our own generated mod supplies a real translation */
  GENERATED = 'generated',
  /** Our own generated mod holds it, still in the source language: a refused string */
  ENGLISH = 'english',
  /**
   * Our generated mod holds the source text, but the translation memory says the backend
   * answered with exactly that. A proper name it chose to keep is not a refusal, and
   * retrying it would only get the same answer back.
   */
  KEPT = 'kept',
  /** Nobody translated it and nothing was generated for it */
  MISSING = 'missing'
}

/** One localisation key of one mod, for one target language */
export interface KeyReport {
  modId: string
  modName: string
  language: string
  key: string
  /** Source file the key is declared in */
  file: string
  /** Value in the source language */
  source: string
  state: KeyState
  /** Who supplies the current value: a mod name, or the generated file */
  provider?: string
  /** Why the translator left it alone, only filled by a run report */
  reason?: string
  /** Markup or numbers only, nothing here is ever sent to a translator */
  markupOnly?: boolean
  /**
   * Our generated mod also holds this key while somebody else translates it. The generated
   * mod loads last, so its value is the one the game shows: the real translation is hidden
   * until the next run drops the key.
   */
  shadowed?: boolean
}

/** One mod as reported by a scan, before anything is written */
export interface ScannedMod {
  id: string
  name: string
  path: string
  localisationFiles: number
  sourceFiles: number
  /** Missing files per target language */
  missing: Record<string, number>
  /** Total keys the source language declares */
  sourceKeys: number
  /** A localisation folder spelled the other way exists here: wrong game selected */
  otherSpelling?: boolean
  /** Localisation mods supplying part of this one's translation */
  coveredBy?: string[]
  /** Keys still untranslated, per target language */
  missingKeys: Record<string, number>
  /** Keys already translated by anyone, our own generated mod included, per target language */
  coveredKeys: Record<string, number>
  /**
   * Keys our own generated mod holds but left in the source language, per target language.
   * They are counted as missing, not as covered: a previous run refused them and the next
   * one has to try again.
   */
  englishKeys: Record<string, number>
  /**
   * Keys the backend answered with the source text itself, per target language. Proper
   * names mostly: they read as untranslated but retrying them costs money for nothing.
   */
  keptKeys: Record<string, number>
  /**
   * Keys our generated mod holds although somebody else translates them, per target
   * language. Our mod loads last, so these hide a real translation until the next run.
   */
  shadowedKeys: Record<string, number>
  missingFiles: number
  /** Translatable lines inside the missing files, drives the time estimate */
  missingLines: number
  supportedVersion?: string
  errors: string[]
}

export interface ScanOutput {
  mods: ScannedMod[]
  totals: {
    mods: number
    missingFiles: number
    missingLines: number
    /** Mods holding no localisation folder for the selected game */
    withoutLocalisation: number
    /** Mods where the other spelling was found instead */
    otherSpelling: number
    /** Keys already translated across the whole collection */
    coveredKeys: number
    /** Keys our own generated mod holds but left in the source language */
    englishKeys: number
    /** Keys the backend answered with the source text itself, not a refusal */
    keptKeys: number
    /** Keys our own generated mod hides behind its own copy of somebody else's translation */
    shadowedKeys: number
  }
  /**
   * A copy of the generated mod found inside the scanned folder. It was left out of the
   * scan: our own output must never vouch for itself.
   */
  selfCopy?: string
  /** The generated mod that was read back, when one was found */
  generatedMod?: {
    path: string
    /** Keys it supplies a real translation for */
    translated: number
    /** Keys it holds in the source language, they will be tried again */
    english: number
    /** Keys it holds unchanged because that is what the backend answered */
    kept: number
    /** Keys it hides behind its own copy while a real translation for them exists */
    shadowed: number
    /** Folders that no longer match any scanned mod, they shadow nothing useful */
    orphanNamespaces: string[]
  }
}

/** Result of a single mod folder */
export interface ModResult {
  /** Folder name (workshop id for subscribed mods) */
  id: string
  /** Human readable name read from descriptor.mod, falls back to the folder name */
  name: string
  path: string
  localisationFiles: number
  sourceFiles: number
  createdCount: number
  skippedCount: number
  failedCount: number
  /** Files removed from the generated mod because nothing needs them any more */
  prunedCount: number
  /** Sample of created files per language, capped to keep the IPC payload usable */
  created: Record<string, string[]>
  /** How many created files were left out of `created` */
  truncated: number
  /** supported_version declared by the mod, reused for the generated translation mod */
  supportedVersion?: string
  /** What the translator did for this mod alone, for debugging a run */
  translation?: TranslationCounters
  errors: string[]
}

/** The mod generated by ConvertMode.CREATE_TRANSLATION_MOD */
export interface TranslationMod {
  /** Name shown in the game launcher */
  name: string
  /** Folder name below the game mod directory */
  folder: string
  /** Absolute path of the mod folder */
  path: string
  supportedVersion: string
}

export interface ConversionOutput {
  mods: ModResult[]
  translationMod?: TranslationMod
  translation?: TranslationCounters
  cancelled?: boolean
  /** Where the key by key report of this run was written */
  reportPath?: string
  totals: {
    mods: number
    modsWithFiles: number
    created: number
    skipped: number
    failed: number
    /** Generated files removed because nothing needs them any more */
    pruned: number
    errors: number
  }
}
