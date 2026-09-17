import { LANGUAGE_CODES, isLanguageCode } from '@ptt/shared/languages'

import type { FetchLike, Provider, TranslateConfig } from '../types.js'
import { OllamaProvider } from './ollama.js'
import { OpenAiProvider } from './openai.js'
import { RapidApiProvider } from './rapidapi.js'

export function createProvider(
  config: TranslateConfig,
  targetLanguage: string,
  fetchFn: FetchLike
): Provider {
  switch (config.provider) {
    case 'rapidapi': {
      if (!isLanguageCode(targetLanguage)) {
        throw new Error(
          `The RapidAPI provider cannot translate into "${targetLanguage}": it only supports ` +
            `${LANGUAGE_CODES.join(', ')}. Pick a built-in language, or use the OpenAI or Ollama provider.`
        )
      }
      return new RapidApiProvider(config.baseUrl, config.apiKey ?? '', config.timeout, fetchFn)
    }
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
