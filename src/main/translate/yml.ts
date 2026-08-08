/**
 * Paradox localisation files look like YAML but are not: values are quoted, keys carry a
 * version number and anything else on the line must survive untouched. A line based
 * parser keeps comments, blank lines and the language header exactly as they were.
 */

/** A translatable entry of a localisation file */
export interface LocEntry {
  /** Everything before the opening quote, key and version included */
  prefix: string
  /** The quoted value, still escaped as it appears on disk */
  value: string
  /** Everything after the closing quote, trailing comment included */
  suffix: string
}

/** One line of a localisation file */
export interface LocLine {
  /** Raw line, used as-is when there is nothing to translate */
  raw: string
  entry?: LocEntry
}

// key:0 "value"  — the greedy value stops at the last quote of the line
const ENTRY_LINE = /^(\s*[^\s#:][^:]*:\d*\s+)"(.*)"([\s\S]*)$/

/**
 * Parse a localisation file into lines
 * @param content - The file content
 * @returns One item per line, entries carrying a translatable value
 */
export const parseLocFile = (content: string): LocLine[] =>
  content.split('\n').map((raw) => {
    const match = ENTRY_LINE.exec(raw)
    if (!match) return { raw }
    return { raw, entry: { prefix: match[1], value: match[2], suffix: match[3] } }
  })

/**
 * The localisation key of an entry, without its version number
 * @param prefix - The entry prefix, ` my_key:0 `
 * @returns `my_key`
 */
export const entryKey = (prefix: string): string => prefix.trim().replace(/:\d*$/, '')

/**
 * Quotes inside a value must stay escaped or the game stops reading the file
 * @param value - The translated value
 * @returns The value with every quote escaped exactly once
 */
const escapeValue = (value: string): string => value.replace(/\\"/g, '"').replace(/"/g, '\\"')

/**
 * Rebuild a localisation file from its lines
 * @param lines - The parsed lines
 * @returns The file content
 */
export const serializeLocFile = (lines: LocLine[]): string =>
  lines
    .map((line) =>
      line.entry
        ? `${line.entry.prefix}"${escapeValue(line.entry.value)}"${line.entry.suffix}`
        : line.raw
    )
    .join('\n')

/**
 * Every markup construct the games use inside localisation values.
 * They must come back untouched from the translator, so they are extracted and compared
 * rather than trusted.
 */
export const TOKEN_PATTERN =
  /\$[^$\n]*\$|\[[^\]\n]*\]|£[^£\n]*£|£\w+|§.|@\w+!|#[a-zA-Z_;]+(?=\s)|#!|\\n|\\t/g

/**
 * Values worth sending to a translator
 * A value made only of markup or numbers has nothing to translate
 * @param value - The raw value
 * @returns True when the value carries actual text
 */
export const isTranslatable = (value: string): boolean =>
  value.trim().length > 0 && /\p{Letter}{2}/u.test(value.replace(TOKEN_PATTERN, ' '))

/**
 * List the markup tokens of a value
 * @param value - The value
 * @returns The tokens, sorted so two values can be compared regardless of order
 */
export const extractTokens = (value: string): string[] => (value.match(TOKEN_PATTERN) ?? []).sort()

/**
 * Hide markup behind numbered placeholders.
 *
 * A machine translator has no notion of "leave this alone": it renders £energy£ as
 * £энергии£ and drops \n entirely. Numbered placeholders come back untouched and in order,
 * measured against the real service, so the markup is put back afterwards rather than
 * trusted to survive.
 * @param text - The source value
 * @returns The masked text and the tokens that were taken out
 */
export const maskTokens = (text: string): { masked: string; tokens: string[] } => {
  const tokens: string[] = []
  const masked = text.replace(TOKEN_PATTERN, (token) => {
    tokens.push(token)
    return `{${tokens.length - 1}}`
  })
  return { masked, tokens }
}

/**
 * Put the markup back where the placeholders are
 * @param text - The translated masked text
 * @param tokens - The tokens taken out by maskTokens
 * @returns The text with markup restored, or null when a placeholder was lost
 */
export const restoreTokens = (text: string, tokens: string[]): string | null => {
  let restored = text
  for (const [index, token] of tokens.entries()) {
    const placeholder = `{${index}}`
    if (!restored.includes(placeholder)) return null
    restored = restored.replace(placeholder, () => token)
  }
  // A leftover placeholder means the service invented one, the string cannot be trusted
  return /\{\d+\}/.test(restored) ? null : restored
}

/**
 * Check a translation kept every markup token of its source
 * @param source - The source value
 * @param translated - The translated value
 * @returns True when both carry the same tokens
 */
export const tokensMatch = (source: string, translated: string): boolean => {
  const before = extractTokens(source)
  const after = extractTokens(translated)
  return before.length === after.length && before.every((token, index) => token === after[index])
}
