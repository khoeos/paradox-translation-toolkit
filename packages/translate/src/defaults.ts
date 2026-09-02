import type { TranslateConfig, TranslateProvider } from './types.js'

export { TRANSLATE_PROVIDERS } from './types.js'
export type { TranslateProvider, TranslateConfig }

export interface ProviderDefaults {
  baseUrl: string
  model: string
  needsApiKey: boolean
  fixedModel: boolean
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

export const TRANSLATE_LIMITS = {
  batchSize: { min: 1, max: 200 },
  concurrency: { min: 1, max: 16 },
  retries: { min: 1, max: 10 },
  timeout: { min: 5_000, max: 900_000 }
} as const

export function isDefaultBaseUrl(baseUrl: string): boolean {
  return Object.values(PROVIDER_DEFAULTS).some(defaults => defaults.baseUrl === baseUrl)
}
