import { parseAnswer } from '../answer.js'
import { checkBaseUrl, describeFailure, trimTrailingSlash, withCancel } from '../http.js'
import { buildPrompt } from '../prompt.js'
import type { FetchLike, Hint, Provider } from '../types.js'

/**
 * Any OpenAI-compatible endpoint: Groq, OpenRouter, Gemini, LM Studio, vLLM, ...
 *
 * Ported from PR #4 (e21ee7a, `src/main/translate/providers.ts`) by Artem Kondrashev.
 */
export class OpenAiProvider implements Provider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey: string,
    private readonly timeout: number,
    private readonly fetchFn: FetchLike,
    private readonly domain?: string
  ) {}

  async translate(
    texts: readonly string[],
    language: string,
    hints?: readonly Hint[],
    signal?: AbortSignal
  ): Promise<Array<string | undefined>> {
    const check = checkBaseUrl(this.baseUrl, this.apiKey.length > 0)
    if (!check.ok) throw new Error(check.reason)

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`

    const response = await this.fetchFn(`${trimTrailingSlash(this.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers,
      signal: withCancel(this.timeout, signal),
      body: JSON.stringify({
        model: this.model,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: buildPrompt(texts, language, this.domain, hints) }]
      })
    })

    if (!response.ok) throw new Error(await describeFailure(response))

    const data = await response.json()
    return parseAnswer(readContent(data), texts.length).slots
  }
}

function readContent(data: unknown): string {
  if (typeof data !== 'object' || data === null || !('choices' in data)) return ''
  const choices = data.choices
  if (!Array.isArray(choices)) return ''
  const first: unknown = choices[0]
  if (typeof first !== 'object' || first === null || !('message' in first)) return ''
  const message = first.message
  if (typeof message !== 'object' || message === null || !('content' in message)) return ''
  return typeof message.content === 'string' ? message.content : ''
}
