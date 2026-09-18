export type {
  TranslateProvider,
  FetchLike,
  FetchInit,
  FetchResponse,
  Hint,
  Provider,
  TranslateConfig,
  TranslationCounters,
  RefusalReason,
  Refusal,
  Glossary,
  GlossaryStats,
  GlossaryReport,
  GlossarySkipReason
} from './types.js'
export { TRANSLATE_PROVIDERS, REFUSAL_REASONS } from './types.js'
export { PROBE_PLAIN, PROBE_MARKUP, PROBE_TEXTS, keptProbeMarkup } from './probe.js'

export {
  PROVIDER_DEFAULTS,
  DEFAULT_PROVIDER,
  TRANSLATE_DEFAULTS,
  TRANSLATE_LIMITS,
  isDefaultBaseUrl,
  hasModelList,
  MODEL_LIST_TIMEOUT,
  type ProviderDefaults
} from './defaults.js'
export { LANGUAGE_DISPLAY_NAMES } from '@ptt/shared/languages'
export { RAPIDAPI_CODES, MAPPED_LANGUAGE_CODES } from './language-codes.js'
export { buildPrompt, buildAnswerSchema, indexed, type AnswerSchema } from './prompt.js'
export { parseAnswer, type ParsedAnswer } from './answer.js'
export {
  withCancel,
  describeFailure,
  checkBaseUrl,
  trimTrailingSlash,
  HttpFailure,
  httpFailure,
  type BaseUrlCheck
} from './http.js'
export { classifyRetry, backoffDelay, sleep, type RetryKind, type SleepLike } from './backoff.js'

export { getProviderModels, readModelIds, type ModelListOptions } from './models.js'

export { OllamaProvider } from './providers/ollama.js'
export { OpenAiProvider } from './providers/openai.js'
export { RapidApiProvider } from './providers/rapidapi.js'
export { createProvider } from './providers/factory.js'

export {
  TranslationMemory,
  FLUSH_EVERY,
  safeFileSegment,
  translationMemoryDir,
  openTranslationMemory,
  clearMemoryFiles
} from './memory.js'
export { createEngineForRun, type EngineForRunOptions } from './engine-factory.js'
export {
  TranslationEngine,
  TranslationFailure,
  describeTokenLoss,
  BACKEND_DOWN_AFTER,
  MAX_REMEMBERED_REFUSALS,
  MAX_REASKS_PER_RUN,
  type EngineOptions,
  type TranslateResult
} from './engine.js'
export {
  collectHints,
  isUsableTerm,
  MAX_TERM_LENGTH,
  MAX_TERM_WORDS,
  MAX_HINTS_PER_BATCH,
  MIN_SINGLE_WORD,
  STOP_WORDS,
  glossaryToStats,
  describeGlossaryProblems
} from './glossary.js'
export { glossaryCacheDir } from './glossary-cache.js'
