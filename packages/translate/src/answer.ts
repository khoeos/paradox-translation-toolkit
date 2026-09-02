import { isRecord } from './guards.js'

const JSON_BLOCK_RE = /\{[\s\S]*\}|\[[\s\S]*\]/

export interface ParsedAnswer {
  slots: Array<string | undefined>
  keyed: boolean
}

export function parseAnswer(content: string, expected: number): ParsedAnswer {
  const parsed = parseJson(content)
  const collection = extractCollection(parsed)

  if (Array.isArray(collection)) {
    if (collection.length !== expected) {
      throw new Error(`Model returned ${collection.length} strings instead of ${expected}`)
    }
    return { slots: collection.map(asString), keyed: false }
  }

  const slots: Array<string | undefined> = []
  for (let index = 0; index < expected; index++) {
    slots.push(asString(collection[String(index)]))
  }
  return { slots, keyed: true }
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    const match = JSON_BLOCK_RE.exec(content)
    if (!match) throw new Error('Model did not answer with JSON')
    return JSON.parse(match[0])
  }
}

function extractCollection(parsed: unknown): unknown[] | Record<string, unknown> {
  if (Array.isArray(parsed)) return parsed
  if (!isRecord(parsed)) throw new Error('Model answer holds no translation collection')

  const translations = parsed.translations
  if (Array.isArray(translations) || isRecord(translations)) return translations

  for (const value of Object.values(parsed)) {
    if (Array.isArray(value) || isRecord(value)) return value
  }
  throw new Error('Model answer holds no translation collection')
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
