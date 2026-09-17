import { maskTokens, restoreTokens } from '@ptt/parser'
import { LANGUAGE_CODES, getTargetLanguageCode } from '@ptt/shared/languages'

import { isRecord } from '../guards.js'
import { checkBaseUrl, describeFailure, withCancel } from '../http.js'
import { RAPIDAPI_CODES } from '../language-codes.js'
import type { FetchLike, Hint, Provider } from '../types.js'

export class RapidApiProvider implements Provider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeout: number,
    private readonly fetchFn: FetchLike
  ) {}

  async translate(
    texts: readonly string[],
    language: string,
    sourceLanguage: string,
    _hints?: readonly Hint[],
    signal?: AbortSignal
  ): Promise<Array<string | undefined>> {
    const check = checkBaseUrl(this.baseUrl, this.apiKey.length > 0)
    if (!check.ok) throw new Error(check.reason)

    const target = serviceCode(language)
    const origin = serviceCode(sourceLanguage)

    const masked = texts.map(text => maskTokens(text))
    const content: Record<string, string> = {}
    masked.forEach((item, index) => {
      content[String(index)] = item.masked
    })

    const url = new URL(this.baseUrl)
    const response = await this.fetchFn(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-key': this.apiKey,
        'x-rapidapi-host': url.host
      },
      signal: withCancel(this.timeout, signal),
      body: JSON.stringify({
        origin_language: origin,
        target_language: target,
        json_content: content
      })
    })

    if (!response.ok) throw new Error(await describeFailure(response))

    const data = await response.json()
    const translated = readTranslatedJson(data)
    if (!translated) throw new Error('Service answered without translated_json')

    return masked.map((item, index) => {
      const answer = translated[String(index)]
      if (typeof answer !== 'string') return undefined
      return restoreTokens(answer, item.tokens) ?? undefined
    })
  }
}

function serviceCode(language: string): string {
  const code = getTargetLanguageCode(language)
  if (code === undefined) {
    throw new Error(
      `The RapidAPI provider cannot translate into "${language}": it only supports ` +
        `${LANGUAGE_CODES.join(', ')}. Pick a built-in language, or use the OpenAI or Ollama provider.`
    )
  }
  return RAPIDAPI_CODES[code]
}

function readTranslatedJson(data: unknown): Record<string, unknown> | undefined {
  if (!isRecord(data)) return undefined
  const translated = data.translated_json
  return isRecord(translated) ? translated : undefined
}
