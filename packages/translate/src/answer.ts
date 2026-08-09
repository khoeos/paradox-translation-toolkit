/**
 * Reading a model answer back.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translate/providers.ts` `parseAnswer`) by
 * Artem Kondrashev, with two deliberate changes:
 *
 * - Audit finding S-5: the original coerced every slot with `String(item)`, so a `null`, a
 *   number or an object became the literal `"null"`, `"123"` or `"[object Object]"`, all
 *   truthy, all written into a .yml and remembered. Only strings survive now; anything else
 *   becomes `undefined` and the caller refuses that string.
 * - Audit finding S-4: an index-keyed object is accepted and preferred, so a model that
 *   reorders its answer cannot put the wrong translation on the wrong key. A bare array is
 *   still read, positionally, because that is what older prompts produce.
 */

import { isRecord } from './guards.js'

const JSON_BLOCK_RE = /\{[\s\S]*\}|\[[\s\S]*\]/

export interface ParsedAnswer {
  /** One slot per requested string, `undefined` where nothing usable came back. */
  slots: Array<string | undefined>
  /** True when the answer carried explicit indices, so no positional guessing was needed. */
  keyed: boolean
}

/**
 * Pull the translations out of whatever shape the model answered with.
 * @param content - The raw model answer
 * @param expected - How many strings were asked for
 * @returns One slot per requested string
 * @throws When the answer holds no readable translation collection at all
 */
export function parseAnswer(content: string, expected: number): ParsedAnswer {
  const parsed = parseJson(content)
  const collection = extractCollection(parsed)

  if (Array.isArray(collection)) {
    // Positional: the length is the only guarantee available, so it has to hold exactly.
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
    // Some models wrap the JSON in prose or a code fence.
    const match = JSON_BLOCK_RE.exec(content)
    if (!match) throw new Error('Model did not answer with JSON')
    return JSON.parse(match[0])
  }
}

/** The array or index-keyed object holding the translations, wherever the model put it. */
function extractCollection(parsed: unknown): unknown[] | Record<string, unknown> {
  if (Array.isArray(parsed)) return parsed
  if (!isRecord(parsed)) throw new Error('Model answer holds no translation collection')

  const translations = parsed.translations
  if (Array.isArray(translations) || isRecord(translations)) return translations

  // Some models rename the field. The first collection-shaped value is the answer.
  for (const value of Object.values(parsed)) {
    if (Array.isArray(value) || isRecord(value)) return value
  }
  throw new Error('Model answer holds no translation collection')
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined
}
