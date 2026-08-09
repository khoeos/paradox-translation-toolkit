import type { Hint } from './types.js'

/**
 * The instructions every model backend gets. They all speak the same prompt.
 *
 * Ported verbatim from PR #4 (e21ee7a, `src/main/translate/providers.ts` `buildPrompt`) by
 * Artem Kondrashev. The wording is load-bearing: it was tuned against real models, and the
 * markup clause is what keeps a `$VARIABLE$` from coming back translated.
 */
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
 * The batch as an index-keyed object rather than a bare array.
 *
 * Audit finding S-4: with an array on both sides only the length was checked, so a model that
 * reordered its answer put the wrong translation on the wrong key. For prose with no markup
 * `tokensMatch` cannot catch it, so it was written to disk and remembered. Explicit keys make
 * a reorder harmless.
 */
export function indexed(texts: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  texts.forEach((text, index) => {
    out[String(index)] = text
  })
  return out
}
