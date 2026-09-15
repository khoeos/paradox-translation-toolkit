const MAX_VDF_DEPTH = 32
export const MAX_VDF_CONTENT_UTF16_LENGTH = 262_144

export type VdfValue = string | VdfNode
export interface VdfNode {
  [key: string]: VdfValue
}

interface Cursor {
  pos: number
}

class VdfDepthExceededError extends Error {}

const isWhitespace = (char: string | undefined): boolean =>
  char === ' ' || char === '\t' || char === '\r' || char === '\n'

const skipWhitespaceAndComments = (content: string, cursor: Cursor): void => {
  for (;;) {
    while (cursor.pos < content.length && isWhitespace(content[cursor.pos])) {
      cursor.pos += 1
    }
    if (content[cursor.pos] === '/' && content[cursor.pos + 1] === '/') {
      while (cursor.pos < content.length && content[cursor.pos] !== '\n') {
        cursor.pos += 1
      }
      continue
    }
    break
  }
}

const readQuotedString = (content: string, cursor: Cursor): string => {
  cursor.pos += 1
  let result = ''
  while (cursor.pos < content.length) {
    const char = content[cursor.pos]
    if (char === undefined) {
      break
    }
    if (char === '"') {
      cursor.pos += 1
      return result
    }
    if (char === '\\') {
      const next = content[cursor.pos + 1]
      if (next === '\\') {
        result += '\\'
        cursor.pos += 2
        continue
      }
      if (next === '"') {
        result += '"'
        cursor.pos += 2
        continue
      }
      result += char
      cursor.pos += 1
      continue
    }
    result += char
    cursor.pos += 1
  }
  return result
}

const parseObjectBody = (content: string, cursor: Cursor, depth: number): VdfNode => {
  const node: VdfNode = Object.create(null)
  for (;;) {
    skipWhitespaceAndComments(content, cursor)
    if (cursor.pos >= content.length) {
      return node
    }
    const char = content[cursor.pos]
    if (char === '}') {
      cursor.pos += 1
      return node
    }
    if (char !== '"') {
      cursor.pos += 1
      continue
    }
    const key = readQuotedString(content, cursor)
    skipWhitespaceAndComments(content, cursor)
    const valueChar = content[cursor.pos]
    if (valueChar === '"') {
      node[key] = readQuotedString(content, cursor)
      continue
    }
    if (valueChar === '{') {
      if (depth + 1 > MAX_VDF_DEPTH) {
        throw new VdfDepthExceededError()
      }
      cursor.pos += 1
      node[key] = parseObjectBody(content, cursor, depth + 1)
      continue
    }
    node[key] = ''
  }
}

export const parseVdf = (content: string): VdfNode => {
  if (content.length > MAX_VDF_CONTENT_UTF16_LENGTH) {
    return {}
  }
  const cursor: Cursor = { pos: 0 }
  try {
    return parseObjectBody(content, cursor, 0)
  } catch (error) {
    if (error instanceof VdfDepthExceededError) {
      return {}
    }
    throw error
  }
}
