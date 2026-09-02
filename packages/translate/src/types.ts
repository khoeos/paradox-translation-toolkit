import type { LanguageCode } from '@ptt/shared'

export const TRANSLATE_PROVIDERS = ['ollama', 'openai', 'rapidapi'] as const

export type TranslateProvider = (typeof TRANSLATE_PROVIDERS)[number]

export type { FetchLike, FetchInit, FetchResponse } from '@ptt/shared'

export interface Hint {
  source: string
  target: string
}

export interface Provider {
  translate(
    texts: readonly string[],
    language: string,
    hints?: readonly Hint[],
    signal?: AbortSignal
  ): Promise<Array<string | undefined>>
}

export interface TranslateConfig {
  enabled: boolean
  provider: TranslateProvider
  baseUrl: string
  model: string
  apiKey?: string
  batchSize: number
  concurrency: number
  retries: number
  timeout: number
  domain?: string
  gamePath?: string
}

export interface TranslationCounters {
  translated: number
  cached: number
  failed: number
}

export type RefusalReason = 'markup' | 'empty' | 'backend' | 'control'

export interface Refusal {
  value: string
  language: LanguageCode
  reason: RefusalReason
  detail?: string
}

export interface Glossary {
  exact: Map<string, string>
  terms: Map<string, Hint>
  builtFrom: string
  files: number
}
