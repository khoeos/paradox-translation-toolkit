import type { FsLike, GameContextRef } from '@ptt/converter'
import { posixJoin, readModKeys } from '@ptt/converter'
import { hasMarkup } from '@ptt/parser'
import type { LanguageCode } from '@ptt/shared'

import type { Glossary, Hint } from './types.js'

/*
 * Ported from PR #4 (e21ee7a, `src/main/translate/glossary.ts`) by Artem Kondrashev.
 */

/** Longest a value may be to count as a term rather than a sentence. */
export const MAX_TERM_LENGTH = 42
export const MAX_TERM_WORDS = 4

/** Terms handed to the model for one batch: enough to help without flooding the prompt. */
export const MAX_HINTS_PER_BATCH = 60

/** Shortest a single word may be before it is more noise than terminology. */
export const MIN_SINGLE_WORD = 4

/**
 * Function words that happen to be a whole label somewhere in the game.
 * Left in, they teach the model that "to" is "То" and poison every batch.
 */
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

/** A value carrying markup, no letters or no meaning is useless as a glossary term. */
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

/**
 * Build the glossary from an installed game.
 *
 * The base game's own localisation is read through `readModKeys`, exactly like a mod: the game
 * folder follows the same `_l_<language>.yml` convention, so there is no reason for a second
 * traversal here.
 * @param gamePath - The game installation folder
 * @param gameDef - The game, for its localisation folder spelling and language tokens
 * @param sourceLanguage - The language mod strings are written in
 * @param targetLanguage - The language to translate into
 * @param fs - The injected filesystem
 * @returns The glossary, empty when the game folder holds nothing usable
 */
export async function buildGlossary(
  gamePath: string,
  gameDef: GameContextRef,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  fs: FsLike
): Promise<Glossary> {
  // Paradox installs put the localisation under `game/`.
  const root = posixJoin(gamePath, 'game')
  const keys = await readModKeys(root, gameDef, fs)
  const source = keys.byLanguage.get(sourceLanguage)
  const target = keys.byLanguage.get(targetLanguage)

  const exact = new Map<string, string>()
  // The same English term is translated by many keys: keep the most common rendering.
  const votes = new Map<string, Map<string, number>>()

  if (source && target) {
    for (const [key, sourceEntry] of source) {
      const targetValue = target.get(key)?.value
      const sourceValue = sourceEntry.value
      if (!targetValue || !sourceValue || sourceValue === targetValue) continue

      // Known limitation, audit finding S-20: first match wins here, with no vote and no
      // length filter, so an official rendering out of context short-circuits the model.
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

/**
 * Glossary terms occurring in a batch, so only relevant wording reaches the prompt.
 * @param glossary - The glossary
 * @param texts - The strings about to be translated
 * @returns Source and target pairs to show the model
 */
export function collectHints(glossary: Glossary, texts: readonly string[]): Hint[] {
  const found = new Map<string, Hint>()

  for (const text of texts) {
    const words = text
      .toLowerCase()
      .split(/[^\p{Letter}\p{Number}'-]+/u)
      .filter(Boolean)
    // Terms run up to four words, so every window of that size is worth a lookup.
    for (let start = 0; start < words.length; start++) {
      for (let size = 1; size <= MAX_TERM_WORDS && start + size <= words.length; size++) {
        const candidate = words.slice(start, start + size).join(' ')
        const hit = glossary.terms.get(candidate)
        if (hit && !found.has(candidate)) found.set(candidate, hit)
      }
    }
    if (found.size >= MAX_HINTS_PER_BATCH) break
  }

  // "men-at-arms" adds nothing next to "recruit men-at-arms": keep the longest match only.
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
