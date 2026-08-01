import * as fs from 'fs/promises'
import type { Dirent } from 'fs'
import * as path from 'path'
import { entryKey, parseLocFile, TOKEN_PATTERN } from './yml'

/** Longest a value may be to count as a term rather than a sentence */
const MAX_TERM_LENGTH = 42
const MAX_TERM_WORDS = 4

/** Terms handed to the model for one batch, enough to help without flooding the prompt */
export const MAX_HINTS_PER_BATCH = 60

/**
 * Official translations taken from the game itself.
 *
 * Mod strings constantly reuse the vocabulary of the base game, and that vocabulary has a
 * settled rendering a model cannot guess: CK3 renders "Men-at-Arms" in Russian as
 * "Профессионалы", where a model reaches for "Наёмники", which is a different thing in game.
 * Rather than describe the game and hope, the wording is read from the game.
 */
export interface Glossary {
  /** Whole source strings the game already translates, used as-is without asking a model */
  exact: Map<string, string>
  /** Short terms, keyed lowercased, injected into the prompt when they occur in a batch */
  terms: Map<string, { source: string; target: string }>
  /** Where it came from, so a cache built for another install is not reused */
  builtFrom: string
  files: number
}

const walk = async (dir: string, out: string[] = []): Promise<string[]> => {
  let items: Dirent[]
  try {
    items = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }

  for (const item of items) {
    const full = path.join(dir, item.name)
    if (item.isDirectory()) await walk(full, out)
    else if (item.name.toLowerCase().endsWith('.yml')) out.push(full)
  }
  return out
}

/**
 * Read every key of one language of the base game
 * @param root - The game localisation folder
 * @param language - The language folder name
 * @returns Key to value, and how many files were read
 */
const readLanguage = async (
  root: string,
  language: string
): Promise<{ values: Map<string, string>; files: number }> => {
  const files = await walk(path.join(root, language))
  const values = new Map<string, string>()

  for (const file of files) {
    let content: string
    try {
      content = await fs.readFile(file, 'utf8')
    } catch {
      continue
    }
    for (const line of parseLocFile(content)) {
      if (!line.entry) continue
      const key = entryKey(line.entry.prefix)
      if (!values.has(key)) values.set(key, line.entry.value)
    }
  }

  return { values, files: files.length }
}

/**
 * Function words that happen to be a whole label somewhere in the game.
 * Left in, they teach the model that "to" is "То" and poison every batch.
 */
const STOP_WORDS = new Set([
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

/** Shortest a single word may be before it is more noise than terminology */
const MIN_SINGLE_WORD = 4

/** A value carrying markup, no letters or no meaning is useless as a glossary term */
const isUsableTerm = (value: string): boolean => {
  if (value.length === 0 || value.length > MAX_TERM_LENGTH) return false

  TOKEN_PATTERN.lastIndex = 0
  const hasMarkup = TOKEN_PATTERN.test(value)
  TOKEN_PATTERN.lastIndex = 0
  if (hasMarkup) return false

  const words = value.trim().split(/\s+/)
  if (words.length > MAX_TERM_WORDS) return false
  if (!/\p{Letter}{2}/u.test(value)) return false

  if (words.length === 1) {
    const word = words[0].toLowerCase()
    if (word.length < MIN_SINGLE_WORD || STOP_WORDS.has(word)) return false
  }

  return true
}

/**
 * Build the glossary from an installed game
 * @param gamePath - The game installation folder
 * @param translateKey - localisation or localization, depending on the game
 * @param sourceLanguage - The source language folder name
 * @param targetLanguage - The target language folder name
 * @returns The glossary, empty when the game folder holds nothing usable
 */
export const buildGlossary = async (
  gamePath: string,
  translateKey: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<Glossary> => {
  const root = path.join(gamePath, 'game', translateKey)
  const [source, target] = await Promise.all([
    readLanguage(root, sourceLanguage),
    readLanguage(root, targetLanguage)
  ])

  const exact = new Map<string, string>()
  // The same English term is translated by many keys, keep the most common rendering
  const votes = new Map<string, Map<string, number>>()

  for (const [key, sourceValue] of source.values) {
    const targetValue = target.values.get(key)
    if (!targetValue || !sourceValue || sourceValue === targetValue) continue

    if (!exact.has(sourceValue)) exact.set(sourceValue, targetValue)

    if (isUsableTerm(sourceValue) && isUsableTerm(targetValue)) {
      const lower = sourceValue.toLowerCase()
      const perTarget = votes.get(lower) ?? new Map<string, number>()
      perTarget.set(targetValue, (perTarget.get(targetValue) ?? 0) + 1)
      votes.set(lower, perTarget)
    }
  }

  const terms = new Map<string, { source: string; target: string }>()
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

  return {
    exact,
    terms,
    builtFrom: gamePath,
    files: source.files + target.files
  }
}

/**
 * Glossary terms occurring in a batch, so only relevant wording reaches the prompt
 * @param glossary - The glossary
 * @param texts - The strings about to be translated
 * @returns Source and target pairs to show the model
 */
export const collectHints = (
  glossary: Glossary,
  texts: string[]
): { source: string; target: string }[] => {
  const found = new Map<string, { source: string; target: string }>()

  for (const text of texts) {
    const words = text
      .toLowerCase()
      .split(/[^\p{Letter}\p{Number}'-]+/u)
      .filter(Boolean)
    // Terms run up to four words, so every window of that size is worth a lookup
    for (let start = 0; start < words.length; start++) {
      for (let size = 1; size <= MAX_TERM_WORDS && start + size <= words.length; size++) {
        const candidate = words.slice(start, start + size).join(' ')
        const hit = glossary.terms.get(candidate)
        if (hit && !found.has(candidate)) found.set(candidate, hit)
      }
    }
    if (found.size >= MAX_HINTS_PER_BATCH) break
  }

  // "men-at-arms" adds nothing next to "recruit men-at-arms", keep the longest match only
  const matched = [...found.keys()]
  const kept = matched.filter(
    (candidate) => !matched.some((other) => other !== candidate && other.includes(candidate))
  )

  return kept.map((candidate) => found.get(candidate)!).slice(0, MAX_HINTS_PER_BATCH)
}

/**
 * Load a cached glossary, or build and cache it
 * @param cacheDir - Where the cache lives
 * @param gamePath - The game installation folder
 * @param cacheKey - Distinguishes game and language pair
 * @param translateKey - localisation or localization
 * @param sourceLanguage - The source language folder name
 * @param targetLanguage - The target language folder name
 * @returns The glossary
 */
export const loadGlossary = async (
  cacheDir: string,
  gamePath: string,
  cacheKey: string,
  translateKey: string,
  sourceLanguage: string,
  targetLanguage: string
): Promise<Glossary> => {
  const file = path.join(cacheDir, `${cacheKey.replace(/[^a-z0-9_-]/gi, '_')}.json`)

  try {
    const cached = JSON.parse(await fs.readFile(file, 'utf8'))
    if (cached.builtFrom === gamePath) {
      return {
        exact: new Map(cached.exact),
        terms: new Map(cached.terms),
        builtFrom: cached.builtFrom,
        files: cached.files
      }
    }
  } catch {
    // No cache, or one built from another installation
  }

  const glossary = await buildGlossary(gamePath, translateKey, sourceLanguage, targetLanguage)

  if (glossary.exact.size > 0) {
    try {
      await fs.mkdir(cacheDir, { recursive: true })
      await fs.writeFile(
        file,
        JSON.stringify({
          builtFrom: glossary.builtFrom,
          files: glossary.files,
          exact: [...glossary.exact],
          terms: [...glossary.terms]
        }),
        'utf8'
      )
    } catch {
      // A cache that cannot be written just means rebuilding next time
    }
  }

  return glossary
}
