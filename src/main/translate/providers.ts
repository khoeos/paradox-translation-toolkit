import { TranslateConfig, TranslateProvider } from '../../global/types'
import { maskTokens, restoreTokens } from './yml'

/** A batch translator, whatever backend actually does the work */
export interface Provider {
  /**
   * Translate a batch of strings
   * @param texts - The strings to translate
   * @param language - The target language, in English (Russian, German, ...)
   * @param hints - Wording taken from the game itself for terms occurring in this batch
   * @returns The translations, same order and same length as `texts`
   */
  translate(
    texts: string[],
    language: string,
    hints?: { source: string; target: string }[],
    signal?: AbortSignal
  ): Promise<string[]>
}

/** Instructions shared by every backend, they all speak the same prompt */
const buildPrompt = (
  texts: string[],
  language: string,
  domain?: string,
  hints?: { source: string; target: string }[]
): string =>
  `You translate video game localisation strings from English to ${language}.

${domain ? `These strings belong to a mod for ${domain}\n\n` : ''}${
    hints?.length
      ? `The base game already translates these terms. Reuse its wording wherever it fits, ` +
        `it is what players of this game expect:\n${hints
          .map((hint) => `  ${hint.source} = ${hint.target}`)
          .join('\n')}\n\n`
      : ''
  }Rules:
- Translate only the human readable text.
- Use the wording the game itself uses. These are interface strings of a known game,
  not generic prose: a trait, a title or a casus belli must read the way a player of
  that game expects, not as a literal dictionary rendering.
- Markup tokens MUST be reproduced exactly, character for character, in the same order:
  $VARIABLE$, [Scope.Function], £icon£, §Y and §! colour codes, #bold and #!, \\n, \\t
- Never add, remove, reorder or translate a markup token.
- Keep the tone of a strategy game interface. Be concise, these strings go into a UI.
- Do not add quotes, comments or explanations.

Answer with JSON: {"translations": [...]} holding exactly ${texts.length} strings, in the same order as the input.

Input:
${JSON.stringify(texts, null, 1)}`

/**
 * Pull the translation array out of whatever shape the model answered with
 * @param content - The raw model answer
 * @param expected - How many strings were asked for
 * @returns The translations
 */
const parseAnswer = (content: string, expected: number): string[] => {
  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    // Some models wrap the JSON in prose or a code fence
    const match = content.match(/\{[\s\S]*\}|\[[\s\S]*\]/)
    if (!match) throw new Error('Model did not answer with JSON')
    parsed = JSON.parse(match[0])
  }

  const list = Array.isArray(parsed)
    ? parsed
    : ((parsed as Record<string, unknown>)?.translations ??
      Object.values(parsed as Record<string, unknown>)[0])

  if (!Array.isArray(list)) throw new Error('Model answer holds no translation array')
  if (list.length !== expected) {
    throw new Error(`Model returned ${list.length} strings instead of ${expected}`)
  }

  return list.map((item) => String(item))
}

/**
 * A request must end on its own timeout, but also the moment the user hits stop
 * @param timeout - Per request timeout
 * @param signal - The run wide cancellation signal, when there is one
 * @returns The signal to hand to fetch
 */
const withCancel = (timeout: number, signal?: AbortSignal): AbortSignal =>
  signal ? AbortSignal.any([AbortSignal.timeout(timeout), signal]) : AbortSignal.timeout(timeout)

/**
 * Read an error body without letting a huge HTML page into the logs
 * @param response - The failed response
 * @returns A short message
 */
const describeFailure = async (response: Response): Promise<string> => {
  const body = await response.text().catch(() => '')
  return `HTTP ${response.status} ${response.statusText} ${body.slice(0, 200)}`.trim()
}

/** Local Ollama server */
class OllamaProvider implements Provider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly timeout: number,
    private readonly domain?: string
  ) {}

  async translate(
    texts: string[],
    language: string,
    hints?: { source: string; target: string }[],
    signal?: AbortSignal
  ): Promise<string[]> {
    const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: withCancel(this.timeout, signal),
      body: JSON.stringify({
        model: this.model,
        stream: false,
        // Reasoning models would spend minutes thinking before each batch
        think: false,
        format: 'json',
        options: { temperature: 0.2 },
        messages: [{ role: 'user', content: buildPrompt(texts, language, this.domain, hints) }]
      })
    })

    if (!response.ok) throw new Error(await describeFailure(response))

    const data = await response.json()
    return parseAnswer(data?.message?.content ?? '', texts.length)
  }
}

/** Any OpenAI compatible endpoint: Groq, OpenRouter, Gemini, LM Studio, vLLM, ... */
class OpenAiProvider implements Provider {
  constructor(
    private readonly baseUrl: string,
    private readonly model: string,
    private readonly apiKey: string,
    private readonly timeout: number,
    private readonly domain?: string
  ) {}

  async translate(
    texts: string[],
    language: string,
    hints?: { source: string; target: string }[],
    signal?: AbortSignal
  ): Promise<string[]> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`

    const response = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
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
    return parseAnswer(data?.choices?.[0]?.message?.content ?? '', texts.length)
  }
}

/** The service wants ISO codes, the rest of the app speaks English language names */
const ISO_CODES: Record<string, string> = {
  english: 'en',
  french: 'fr',
  german: 'de',
  spanish: 'es',
  polish: 'pl',
  portuguese: 'pt',
  russian: 'ru',
  chinese: 'zh',
  korean: 'ko',
  japanese: 'ja'
}

/**
 * A RapidAPI translation hub speaking the TranslateAI JSON shape.
 *
 * Unlike a model, it cannot be told to leave markup alone, so every token is masked before
 * sending and put back afterwards. A string whose placeholders did not survive is dropped
 * rather than written half broken.
 */
class RapidApiProvider implements Provider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly timeout: number
  ) {}

  async translate(
    texts: string[],
    language: string,
    _hints?: { source: string; target: string }[],
    signal?: AbortSignal
  ): Promise<string[]> {
    const masked = texts.map((text) => maskTokens(text))
    const content: Record<string, string> = {}
    masked.forEach((item, index) => {
      content[String(index)] = item.masked
    })

    const url = new URL(this.baseUrl)
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-rapidapi-key': this.apiKey,
        'x-rapidapi-host': url.host
      },
      signal: withCancel(this.timeout, signal),
      body: JSON.stringify({
        origin_language: 'en',
        target_language: ISO_CODES[language.toLowerCase()] ?? language.toLowerCase(),
        json_content: content
      })
    })

    if (!response.ok) throw new Error(await describeFailure(response))

    const data = await response.json()
    const translated = data?.translated_json
    if (!translated) throw new Error('Service answered without translated_json')

    return masked.map((item, index) => {
      const answer = translated[String(index)]
      if (typeof answer !== 'string') return ''
      // An empty result makes the caller keep the source string, which is the safe outcome
      return restoreTokens(answer, item.tokens) ?? ''
    })
  }
}

/**
 * Build the provider described by the user settings
 * @param config - The translation settings
 * @returns The provider
 */
export const createProvider = (config: TranslateConfig): Provider =>
  config.provider === TranslateProvider.RAPIDAPI
    ? new RapidApiProvider(config.baseUrl, config.apiKey ?? '', config.timeout)
    : config.provider === TranslateProvider.OLLAMA
      ? new OllamaProvider(config.baseUrl, config.model, config.timeout, config.domain)
      : new OpenAiProvider(
          config.baseUrl,
          config.model,
          config.apiKey ?? '',
          config.timeout,
          config.domain
        )
