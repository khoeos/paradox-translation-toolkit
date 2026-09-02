import { parseAnswer } from '../answer.js'
import { checkBaseUrl, describeFailure, trimTrailingSlash, withCancel } from '../http.js'
import { buildPrompt } from '../prompt.js'
import type { FetchLike, Hint, Provider } from '../types.js'

export class OllamaProvider implements Provider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
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
    const check = checkBaseUrl(this.baseUrl, false)
    if (!check.ok) throw new Error(check.reason)

    const response = await this.fetchFn(`${trimTrailingSlash(this.baseUrl)}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: withCancel(this.timeout, signal),
      body: JSON.stringify({
        model: this.model,
        stream: false,
        think: false,
        format: 'json',
        options: { temperature: 0.2 },
        messages: [{ role: 'user', content: buildPrompt(texts, language, this.domain, hints) }]
      })
    })

    if (!response.ok) throw new Error(await describeFailure(response))

    const data = await response.json()
    return parseAnswer(readContent(data), texts.length).slots
  }
}

function readContent(data: unknown): string {
  if (typeof data !== 'object' || data === null || !('message' in data)) return ''
  const message = data.message
  if (typeof message !== 'object' || message === null || !('content' in message)) return ''
  return typeof message.content === 'string' ? message.content : ''
}
