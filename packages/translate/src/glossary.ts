import type { FsLike, GameContextRef } from '@ptt/converter'
import { posixJoin, readModKeys } from '@ptt/converter'
import { hasMarkup } from '@ptt/parser'
import type { LanguageCode } from '@ptt/shared'

import type { Glossary, Hint } from './types.js'

export const MAX_TERM_LENGTH = 42
export const MAX_TERM_WORDS = 4

export const MAX_HINTS_PER_BATCH = 60

export const MIN_SINGLE_WORD = 4

export const STOP_WORDS = new Set([
  'about',
  'after',
  'all',
  'also',
  'and',
  'any',
  'are',
  'been',
  'both',
  'but',
  'can',
  'did',
  'does',
  'done',
  'each',
  'else',
  'even',
  'ever',
  'every',
  'for',
  'from',
  'had',
  'has',
  'have',
  'her',
  'here',
  'him',
  'his',
  'how',
  'into',
  'its',
  'just',
  'less',
  'like',
  'made',
  'make',
  'many',
  'may',
  'more',
  'most',
  'much',
  'must',
  'new',
  'next',
  'none',
  'not',
  'now',
  'off',
  'once',
  'one',
  'only',
  'other',
  'our',
  'out',
  'over',
  'own',
  'per',
  'same',
  'she',
  'should',
  'since',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'them',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'too',
  'two',
  'under',
  'until',
  'upon',
  'use',
  'very',
  'was',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'why',
  'will',
  'with',
  'would',
  'yes',
  'yet',
  'you',
  'your'
])

export function isUsableTerm(value: string): boolean {
  if (value.length === 0 || value.length > MAX_TERM_LENGTH) return false
  if (hasMarkup(value)) return false

  const words = value.trim().split(/\s+/)
  if (words.length > MAX_TERM_WORDS) return false
  if (!/\p{Letter}{2}/u.test(value)) return false

  if (words.length === 1) {
    const word = (words[0] ?? '').toLowerCase()
    if (word.length < MIN_SINGLE_WORD || STOP_WORDS.has(word)) return false
  }

  return true
}

export async function buildGlossary(
  gamePath: string,
  gameDef: GameContextRef,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  fs: FsLike
): Promise<Glossary> {
  const root = posixJoin(gamePath, 'game')
  const keys = await readModKeys(root, gameDef, fs)
  const source = keys.byLanguage.get(sourceLanguage)
  const target = keys.byLanguage.get(targetLanguage)

  const exact = new Map<string, string>()
  const votes = new Map<string, Map<string, number>>()

  if (source && target) {
    for (const [key, sourceEntry] of source) {
      const targetValue = target.get(key)?.value
      const sourceValue = sourceEntry.value
      if (!targetValue || !sourceValue || sourceValue === targetValue) continue

      if (!exact.has(sourceValue)) exact.set(sourceValue, targetValue)

      if (isUsableTerm(sourceValue) && isUsableTerm(targetValue)) {
        const lower = sourceValue.toLowerCase()
        const perTarget = votes.get(lower) ?? new Map<string, number>()
        perTarget.set(targetValue, (perTarget.get(targetValue) ?? 0) + 1)
        votes.set(lower, perTarget)
      }
    }
  }

  const terms = new Map<string, Hint>()
  for (const [lower, perTarget] of votes) {
    let best = ''
    let bestCount = 0
    for (const [value, count] of perTarget) {
      if (count > bestCount) {
        best = value
        bestCount = count
      }
    }
    terms.set(lower, { source: lower, target: best })
  }

  return { exact, terms, builtFrom: gamePath, files: keys.files }
}

export function collectHints(glossary: Glossary, texts: readonly string[]): Hint[] {
  const found = new Map<string, Hint>()

  for (const text of texts) {
    const words = text
      .toLowerCase()
      .split(/[^\p{Letter}\p{Number}'-]+/u)
      .filter(Boolean)
    for (let start = 0; start < words.length; start++) {
      for (let size = 1; size <= MAX_TERM_WORDS && start + size <= words.length; size++) {
        const candidate = words.slice(start, start + size).join(' ')
        const hit = glossary.terms.get(candidate)
        if (hit && !found.has(candidate)) found.set(candidate, hit)
      }
    }
    if (found.size >= MAX_HINTS_PER_BATCH) break
  }

  const matched = [...found.keys()]
  const kept = matched.filter(
    candidate => !matched.some(other => other !== candidate && other.includes(candidate))
  )

  const hints: Hint[] = []
  for (const candidate of kept.slice(0, MAX_HINTS_PER_BATCH)) {
    const hint = found.get(candidate)
    if (hint) hints.push(hint)
  }
  return hints
}
