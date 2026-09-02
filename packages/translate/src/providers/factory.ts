import type { LanguageCode } from '@ptt/shared'

import type { FetchLike, Provider, TranslateConfig } from '../types.js'
import { OllamaProvider } from './ollama.js'
import { OpenAiProvider } from './openai.js'
import { RapidApiProvider } from './rapidapi.js'

export function createProvider(
  config: TranslateConfig,
  targetLanguage: LanguageCode,
  fetchFn: FetchLike
): Provider {
  switch (config.provider) {
    case 'rapidapi':
      return new RapidApiProvider(
        config.baseUrl,
        config.apiKey ?? '',
        config.timeout,
        targetLanguage,
        fetchFn
      )
    case 'ollama':
      return new OllamaProvider(
        config.baseUrl,
        config.model,
        config.timeout,
        fetchFn,
        config.domain
      )
    case 'openai':
      return new OpenAiProvider(
        config.baseUrl,
        config.model,
        config.apiKey ?? '',
        config.timeout,
        fetchFn,
        config.domain
      )
  }
}
