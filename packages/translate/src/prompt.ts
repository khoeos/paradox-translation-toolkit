import type { Hint } from './types.js'

export function buildPrompt(
  texts: readonly string[],
  language: string,
  sourceLanguage: string,
  domain?: string,
  hints?: readonly Hint[]
): string {
  const domainBlock = domain ? `These strings belong to a mod for ${domain}\n\n` : ''
  const hintBlock =
    hints && hints.length > 0
      ? `The base game already translates these terms. Reuse its wording wherever it fits, ` +
        `it is what players of this game expect:\n${hints
          .map(hint => `  ${hint.source} = ${hint.target}`)
          .join('\n')}\n\n`
      : ''

  return `You translate video game localisation strings from ${sourceLanguage} to ${language}.

${domainBlock}${hintBlock}Rules:
- Translate only the human readable text.
- Use the wording the game itself uses. These are interface strings of a known game,
  not generic prose: a trait, a title or a casus belli must read the way a player of
  that game expects, not as a literal dictionary rendering.
- Markup tokens MUST be reproduced exactly, character for character, in the same order:
  $VARIABLE$, [Scope.Function], £icon£, §Y and §! colour codes, #bold and #!, \\n, \\t
- Never add, remove, reorder or translate a markup token.
- Keep the tone of a strategy game interface. Be concise, these strings go into a UI.
- Do not add quotes, comments or explanations.

Answer with JSON: {"translations": {"0": "...", "1": "..."}} holding exactly ${texts.length} entries, keyed by the index of the input string.

Input:
${JSON.stringify(indexed(texts), null, 1)}`
}

/**
 * JSON schema matching the answer shape `buildPrompt` asks for, one required string
 * per input index. Sent as `response_format.json_schema` : OpenAI, LM Studio,
 * llama.cpp and Ollama all accept it, whereas LM Studio rejects `json_object`.
 * Strict mode caps an object at 5000 properties on OpenAI ; TRANSLATE_LIMITS.batchSize
 * (200) keeps every batch well under it. Backends that only know `json_object`
 * (DeepSeek) answer 400 ; `OpenAiProvider` downgrades to it for the rest of the run.
 */
export interface AnswerSchema {
  type: 'object'
  properties: {
    translations: {
      type: 'object'
      properties: Record<string, { type: 'string' }>
      required: string[]
      additionalProperties: false
    }
  }
  required: ['translations']
  additionalProperties: false
}

export function buildAnswerSchema(count: number): AnswerSchema {
  const properties: Record<string, { type: 'string' }> = {}
  const required: string[] = []
  for (let index = 0; index < count; index++) {
    properties[String(index)] = { type: 'string' }
    required.push(String(index))
  }
  return {
    type: 'object',
    properties: {
      translations: { type: 'object', properties, required, additionalProperties: false }
    },
    required: ['translations'],
    additionalProperties: false
  }
}

export function indexed(texts: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  texts.forEach((text, index) => {
    out[String(index)] = text
  })
  return out
}

/**
 * Output budget for one batch. DeepSeek truncates the answer at its own default
 * (4096) unless `max_tokens` is sent, and rejects anything above 8192 ; the ceiling
 * is that common denominator, the estimate is the batch's own size.
 */
const OUTPUT_TOKEN_CEILING = 8192

const MIN_OUTPUT_TOKENS = 512

const CHARS_PER_TOKEN = 2

const OUTPUT_EXPANSION = 1.5

const TOKENS_PER_ENTRY = 8

export function estimateMaxTokens(texts: readonly string[]): number {
  const chars = texts.reduce((total, text) => total + text.length, 0)
  const estimate =
    Math.ceil((chars * OUTPUT_EXPANSION) / CHARS_PER_TOKEN) + texts.length * TOKENS_PER_ENTRY
  return Math.min(OUTPUT_TOKEN_CEILING, Math.max(MIN_OUTPUT_TOKENS, estimate))
}
