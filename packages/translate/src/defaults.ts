import type { TranslateConfig, TranslateProvider } from './types.js'

export { TRANSLATE_PROVIDERS } from './types.js'
export type { TranslateProvider, TranslateConfig }

/*
 * One home for the translation defaults.
 *
 * Ported from PR #4 (e21ee7a) by Artem Kondrashev, where the UI and the CLI each held their
 * own copy and had already drifted apart on three settings (audit finding Q-5): concurrency
 * 1 versus 2, timeout 300s versus 120s, and two different default Ollama models.
 */

export interface ProviderDefaults {
  baseUrl: string
  model: string
  /** The provider needs a key, so the field is shown and validated. */
  needsApiKey: boolean
  /** The provider picks its own model, so the field is hidden. */
  fixedModel: boolean
  /** Lines per second, an order of magnitude used only for the time estimate. */
  linesPerSecond: number
}

export const PROVIDER_DEFAULTS: Record<TranslateProvider, ProviderDefaults> = {
  ollama: {
    baseUrl: 'http://localhost:11434',
    model: 'qwen2.5:7b',
    needsApiKey: false,
    fixedModel: false,
    linesPerSecond: 3
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    needsApiKey: true,
    fixedModel: false,
    linesPerSecond: 3
  },
  rapidapi: {
    baseUrl: 'https://ai-translate.p.rapidapi.com/translates_json',
    model: '',
    needsApiKey: true,
    fixedModel: true,
    linesPerSecond: 60
  }
}

export const DEFAULT_PROVIDER: TranslateProvider = 'ollama'

/** The one set of defaults the UI, the CLI and the worker all start from. */
export const TRANSLATE_DEFAULTS: TranslateConfig = {
  enabled: false,
  provider: DEFAULT_PROVIDER,
  baseUrl: PROVIDER_DEFAULTS[DEFAULT_PROVIDER].baseUrl,
  model: PROVIDER_DEFAULTS[DEFAULT_PROVIDER].model,
  batchSize: 20,
  concurrency: 2,
  retries: 2,
  timeout: 120_000
}

/** Bounds the UI and the CLI both enforce, so a value cannot mean one thing in each. */
export const TRANSLATE_LIMITS = {
  batchSize: { min: 1, max: 200 },
  concurrency: { min: 1, max: 16 },
  retries: { min: 1, max: 10 },
  timeout: { min: 5_000, max: 900_000 }
} as const

/**
 * Whether a base URL is still one of ours, so switching provider may replace it.
 *
 * A URL the user typed is never overwritten; a default left untouched is.
 */
export function isDefaultBaseUrl(baseUrl: string): boolean {
  return Object.values(PROVIDER_DEFAULTS).some(defaults => defaults.baseUrl === baseUrl)
}
