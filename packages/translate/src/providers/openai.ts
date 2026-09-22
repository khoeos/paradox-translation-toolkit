import { parseAnswer } from '../answer.js'
import { checkBaseUrl, httpFailure, trimTrailingSlash, withCancel } from '../http.js'
import { buildAnswerSchema, buildPrompt, estimateMaxTokens } from '../prompt.js'
import type { AnswerSchema } from '../prompt.js'
import type { FetchLike, FetchResponse, Hint, Provider } from '../types.js'

type JsonMode = 'schema' | 'object'

type ResponseFormat =
  | { type: 'json_object' }
  | { type: 'json_schema'; json_schema: { name: string; strict: true; schema: AnswerSchema } }

const RESPONSE_FORMAT_REJECTED = /response_format|json_schema/i

const REJECTION_STATUS = 400

export class OpenAiProvider implements Provider {
  private jsonMode: JsonMode = 'schema'

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
    sourceLanguage: string,
    hints?: readonly Hint[],
    signal?: AbortSignal
  ): Promise<Array<string | undefined>> {
    const check = checkBaseUrl(this.baseUrl, this.apiKey.length > 0)
    if (!check.ok) throw new Error(check.reason)

    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`

    const send = (mode: JsonMode): Promise<FetchResponse> =>
      this.fetchFn(`${trimTrailingSlash(this.baseUrl)}/chat/completions`, {
        method: 'POST',
        headers,
        signal: withCancel(this.timeout, signal),
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          max_tokens: estimateMaxTokens(texts),
          response_format: responseFormat(mode, texts.length),
          messages: [
            {
              role: 'user',
              content: buildPrompt(texts, language, sourceLanguage, this.domain, hints)
            }
          ]
        })
      })

    const response = await this.sendWithFallback(send)

    const data = await response.json()
    return parseAnswer(readContent(data), texts.length).slots
  }

  private async sendWithFallback(
    send: (mode: JsonMode) => Promise<FetchResponse>
  ): Promise<FetchResponse> {
    const response = await send(this.jsonMode)
    if (response.ok) return response

    const failure = await httpFailure(response)
    const rejected =
      this.jsonMode === 'schema' &&
      failure.status === REJECTION_STATUS &&
      RESPONSE_FORMAT_REJECTED.test(failure.message)
    if (!rejected) throw failure

    this.jsonMode = 'object'
    const retry = await send(this.jsonMode)
    if (!retry.ok) throw await httpFailure(retry)
    return retry
  }
}

function responseFormat(mode: JsonMode, count: number): ResponseFormat {
  return mode === 'object'
    ? { type: 'json_object' }
    : {
        type: 'json_schema',
        json_schema: { name: 'translations', strict: true, schema: buildAnswerSchema(count) }
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
