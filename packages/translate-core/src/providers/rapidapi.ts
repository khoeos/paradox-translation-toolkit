import { maskTokens, restoreTokens } from '@ptt/parser-core'
import type { LanguageCode } from '@ptt/shared-types'

import { isRecord } from '../guards.js'
import { checkBaseUrl, describeFailure, withCancel } from '../http.js'
import { RAPIDAPI_CODES } from '../language-codes.js'
import type { FetchLike, Hint, Provider } from '../types.js'

/**
 * A RapidAPI translation hub speaking the TranslateAI JSON shape.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translate/providers.ts`) by Artem Kondrashev.
 *
 * Unlike a model it cannot be told to leave markup alone, so every token is masked before
 * sending and put back afterwards. A string whose placeholders did not survive is dropped
 * rather than written half broken. It maps by explicit key, which is what the model providers
 * were changed to do as well (audit finding S-4).
 */
export class RapidApiProvider implements Provider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeout: number,
    private readonly targetLanguage: LanguageCode,
    private readonly fetchFn: FetchLike
  ) {}

  async translate(
    texts: readonly string[],
    _language: string,
    _hints?: readonly Hint[],
    signal?: AbortSignal
  ): Promise<Array<string | undefined>> {
    const check = checkBaseUrl(this.baseUrl, this.apiKey.length > 0)
    if (!check.ok) throw new Error(check.reason)

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
        origin_language: 'en',
        target_language: RAPIDAPI_CODES[this.targetLanguage],
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
      // A lost placeholder means the markup cannot be put back, so the caller keeps the
      // source string. Known limitation, audit finding S-18: a literal `{0}` in the source
      // collides with the masking scheme and fails closed here.
      return restoreTokens(answer, item.tokens) ?? undefined
    })
  }
}

function readTranslatedJson(data: unknown): Record<string, unknown> | undefined {
  if (!isRecord(data)) return undefined
  const translated = data.translated_json
  return isRecord(translated) ? translated : undefined
}
