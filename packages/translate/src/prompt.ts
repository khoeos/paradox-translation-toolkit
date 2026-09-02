import type { Hint } from './types.js'

export function buildPrompt(
  texts: readonly string[],
  language: string,
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

  return `You translate video game localisation strings from English to ${language}.

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
 * (200) keeps every batch well under it.
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
