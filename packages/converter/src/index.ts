export type {
  FsLike,
  FsDirEntry,
  GameContextRef,
  ModFolder,
  DiscoveredMods,
  LocalisationFilePath,
  ModFilesResult,
  Descriptor,
  LocalisationEntry,
  ModKeys,
  ModEntries,
  Coverage,
  GeneratedEntry,
  GeneratedMod,
  GeneratedModSummary,
  KeyState,
  KeyReport,
  CreationJob,
  ModPlan,
  TranslationMemoryPort,
  KeyPlanOptions,
  ScannedMod,
  ScanTotals,
  ScanOutput,
  TranslationMod,
  Destination,
  ApplyModOptions,
  ModResult,
  ConversionTotals,
  ConversionOutput
} from './types.js'

export {
  posixJoin,
  posixDirname,
  posixBasename,
  posixSplit,
  posixIsAbsolute,
  posixRejoin,
  posixNormalize,
  posixNormalizeStrict,
  posixContains,
  pathKey
} from './path.js'
export {
  MOD_CONCURRENCY,
  MOD_CONCURRENCY_WITH_BACKEND,
  SCAN_DIAGNOSTICS_PER_MOD,
  MAX_SOURCE_FILE_BYTES,
  MAX_MOD_LOCALISATION_BYTES,
  KEY_OVERLAP_MATCH,
  PARTIAL_SUFFIX,
  DEFAULT_MOD_NAME,
  DEFAULT_MOD_FOLDER,
  GENERATED_MOD_FOLDER_MAX_LEN,
  NAMESPACE_ID_MAX_LEN,
  NAMESPACE_LABEL_MAX_LEN
} from './constants.js'
export {
  sanitizeFolderName,
  getModNamespace,
  withPartialSuffix,
  rewriteLanguageInPath
} from './naming.js'
export { resolveGeneratedMod, type GeneratedModPaths } from './generated-mod-paths.js'
export { mapWithConcurrency } from './concurrency.js'
export {
  DIAGNOSTIC_SEVERITIES,
  getParseSeverity,
  hasUnreadableContent,
  splitDiagnostics,
  type DiagnosticSeverity,
  type ModDiagnostic
} from './diagnostics.js'
export { walkFiles, type WalkOptions, type WalkResult } from './walk.js'
export { readModFiles, describeLocalisationFile, otherLocalisationSpelling } from './mod-files.js'
export { readDescriptor, buildDescriptor, pickSupportedVersion } from './descriptor.js'
export { readModKeys, readLocalisationEntries } from './mod-keys.js'
export { buildCoverage, type CoverageOptions } from './coverage.js'
export { discoverMods } from './discover-mods.js'
export { readGeneratedMod, dropOurOwnMod, summariseGeneratedMod } from './generated-mod.js'
export { sumByLanguage } from './totals.js'
export {
  planMod,
  isUntranslated,
  getTranslationModPath,
  pendingValues,
  pendingCount,
  countTranslatableLines
} from './key-plan.js'
export { scanMod, type ScanModResult } from './scan-mod.js'
export { scanMods, type ScanModsOptions } from './scan-mods.js'
export {
  isJobEvent,
  JOB_EVENT_TYPES,
  SCAN_PHASES,
  type JobEvent,
  type JobEventType,
  type ProgressPort,
  type ScanPhase,
  type ScanRunningTotals,
  type TranslationProgress
} from './progress.js'
export { buildTargetContent, type BuildTargetOptions } from './build-target.js'
export { applyModJobs } from './apply-generated.js'
export {
  runConvert,
  collectUntranslated,
  type Cancellation,
  type ConvertRunOptions,
  type ConvertRunResult,
  type TranslationEnginePort
} from './run.js'
export { pruneNamespace, canPrune, type PruneOptions, type PruneReport } from './prune.js'
