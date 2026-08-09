import type { LanguageCode } from '@ptt/shared'

import type { FetchLike, Provider, TranslateConfig } from '../types.js'
import { OllamaProvider } from './ollama.js'
import { OpenAiProvider } from './openai.js'
import { RapidApiProvider } from './rapidapi.js'

/**
 * Build the provider described by the user settings.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translate/providers.ts` `createProvider`) by
 * Artem Kondrashev. It now takes the target language too, because RapidAPI needs a service
 * code and deriving one from an English language name was a lookup waiting to go wrong.
 * @param config - The translation settings
 * @param targetLanguage - The language this provider will translate into
 * @param fetchFn - The injected transport
 * @returns The provider
 */
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
