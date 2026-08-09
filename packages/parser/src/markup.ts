/**
 * The markup grammar Paradox games use inside localisation values.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translate/yml.ts`) by Artem Kondrashev.
 *
 * A value is not free text: it carries variables, scopes, icons, colour codes and literal
 * escapes that the game resolves at runtime. A translation that loses one of them breaks
 * the game, so tokens are extracted and compared rather than trusted to survive a round
 * trip through a machine translator.
 */

/**
 * Every markup construct the games use inside localisation values.
 *
 * In order: `$var$`, `[Scope.Function]`, `£icon£`, `£word`, `§X` (colour, `§!` reset),
 * `@word!`, `#code` followed by whitespace, `#!`, and the literal two-character escapes
 * `\n` and `\t`.
 *
 * Anything absent from this pattern is treated as translatable text and will be sent to a
 * translator verbatim, so a new construct has to be added here and nowhere else.
 *
 * The exported pattern is global, which is what `String.replace` and `String.match` need.
 * It therefore carries a `lastIndex`: never call `.test()` or `.exec()` on it, use
 * `hasMarkup()` instead.
 */
export const TOKEN_PATTERN =
  /\$[^$\n]*\$|\[[^\]\n]*\]|£[^£\n]*£|£\w+|§.|@\w+!|#[a-zA-Z_;]+(?=\s)|#!|\\n|\\t/g

/** Stateless twin of `TOKEN_PATTERN`, so a membership test cannot depend on a `lastIndex`. */
const TOKEN_TEST = new RegExp(TOKEN_PATTERN.source)

/**
 * Whether a value contains at least one markup token.
 * @param value - The raw value
 * @returns True when the value carries markup
 */
export function hasMarkup(value: string): boolean {
  return TOKEN_TEST.test(value)
}

/**
 * Values worth sending to a translator.
 * A value made only of markup, punctuation or numbers has nothing to translate.
 * @param value - The raw value
 * @returns True when the value carries actual text
 */
export function isTranslatable(value: string): boolean {
  return value.trim().length > 0 && /\p{Letter}{2}/u.test(value.replace(TOKEN_PATTERN, ' '))
}

/**
 * List the markup tokens of a value.
 * @param value - The value
 * @returns The tokens, sorted so two values can be compared regardless of order
 */
export function extractTokens(value: string): string[] {
  return (value.match(TOKEN_PATTERN) ?? []).toSorted()
}

/**
 * Hide markup behind numbered placeholders.
 *
 * A machine translator has no notion of "leave this alone": it renders `£energy£` as
 * `£энергии£` and drops `\n` entirely. Numbered placeholders come back untouched and in
 * order, measured against the real service, so the markup is put back afterwards rather
 * than trusted to survive.
 * @param text - The source value
 * @returns The masked text and the tokens that were taken out, in placeholder order
 */
export function maskTokens(text: string): { masked: string; tokens: string[] } {
  const tokens: string[] = []
  const masked = text.replace(TOKEN_PATTERN, token => {
    tokens.push(token)
    return `{${tokens.length - 1}}`
  })
  return { masked, tokens }
}

/**
 * Put the markup back where the placeholders are.
 * @param text - The translated masked text
 * @param tokens - The tokens taken out by `maskTokens`
 * @returns The text with markup restored, or `null` when a placeholder was lost or invented
 */
export function restoreTokens(text: string, tokens: string[]): string | null {
  let restored = text
  for (const [index, token] of tokens.entries()) {
    const placeholder = `{${index}}`
    if (!restored.includes(placeholder)) return null
    // Replacement as a function, so a `$` inside the token is not read as `$&` or `$1`.
    restored = restored.replace(placeholder, () => token)
  }
  // A leftover placeholder means the service invented one, the string cannot be trusted.
  return /\{\d+\}/.test(restored) ? null : restored
}

/**
 * Check a translation kept every markup token of its source.
 *
 * Compared as multisets: order inside the value may change (word order differs between
 * languages), but a token may neither disappear nor appear.
 * @param source - The source value
 * @param translated - The translated value
 * @returns True when both carry the same tokens
 */
export function tokensMatch(source: string, translated: string): boolean {
  const before = extractTokens(source)
  const after = extractTokens(translated)
  return before.length === after.length && before.every((token, index) => token === after[index])
}
