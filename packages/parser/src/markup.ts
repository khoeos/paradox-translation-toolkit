export const TOKEN_PATTERN =
  /\$[^$\n]*\$|\[[^\]\n]*\]|£[^£\n]*£|£\w+|§.|@\w+!|#[a-zA-Z_;]+(?=\s)|#!|\\n|\\t/g

const TOKEN_TEST = new RegExp(TOKEN_PATTERN.source)

export function hasMarkup(value: string): boolean {
  return TOKEN_TEST.test(value)
}

export function isTranslatable(value: string): boolean {
  return value.trim().length > 0 && /\p{Letter}{2}/u.test(value.replace(TOKEN_PATTERN, ' '))
}

export function extractTokens(value: string): string[] {
  return (value.match(TOKEN_PATTERN) ?? []).toSorted()
}

export function maskTokens(text: string): { masked: string; tokens: string[] } {
  const tokens: string[] = []
  const masked = text.replace(TOKEN_PATTERN, token => {
    tokens.push(token)
    return `{${tokens.length - 1}}`
  })
  return { masked, tokens }
}

export function restoreTokens(text: string, tokens: string[]): string | null {
  let restored = text
  for (const [index, token] of tokens.entries()) {
    const placeholder = `{${index}}`
    if (!restored.includes(placeholder)) return null
    restored = restored.replace(placeholder, () => token)
  }
  return /\{\d+\}/.test(restored) ? null : restored
}

export function tokensMatch(source: string, translated: string): boolean {
  const before = extractTokens(source)
  const after = extractTokens(translated)
  return before.length === after.length && before.every((token, index) => token === after[index])
}
