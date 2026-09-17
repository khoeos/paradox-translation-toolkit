import type { FsLike, GameContextRef, ModKeys } from '@ptt/converter'
import { otherLocalisationSpelling, posixJoin, readModKeys } from '@ptt/converter'
import { hasMarkup } from '@ptt/parser'
import type { LanguageCode } from '@ptt/shared'

import type { Glossary, GlossaryReport, GlossarySkipReason, GlossaryStats, Hint } from './types.js'

const NESTED_ROOT_DIR = 'game'

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

function glossaryFromKeys(
  keys: ModKeys,
  gamePath: string,
  root: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode
): Glossary {
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

  return {
    exact,
    terms,
    builtFrom: gamePath,
    root,
    files: keys.files,
    truncated: keys.truncated,
    forLanguage: targetLanguage
  }
}

async function hasLocalisationDir(
  root: string,
  gameDef: GameContextRef,
  fs: FsLike
): Promise<boolean> {
  const spellings = new Set<string>([
    gameDef.localisationDirName,
    otherLocalisationSpelling(gameDef.localisationDirName)
  ])
  const entries = await fs.readdir(root).catch(() => [])
  return entries.some(entry => entry.isDirectory && spellings.has(entry.name.toLowerCase()))
}

async function glossaryRoot(
  gamePath: string,
  gameDef: GameContextRef,
  fs: FsLike
): Promise<string | undefined> {
  const nestedRoot = posixJoin(gamePath, NESTED_ROOT_DIR)
  if (await hasLocalisationDir(nestedRoot, gameDef, fs)) return nestedRoot
  if (await hasLocalisationDir(gamePath, gameDef, fs)) return gamePath
  return undefined
}

function emptyGlossary(gamePath: string, targetLanguage: LanguageCode): Glossary {
  return {
    exact: new Map(),
    terms: new Map(),
    builtFrom: gamePath,
    root: gamePath,
    files: 0,
    truncated: false,
    forLanguage: targetLanguage
  }
}

export async function buildGlossaries(
  gamePath: string,
  gameDef: GameContextRef,
  sourceLanguage: LanguageCode,
  targetLanguages: readonly LanguageCode[],
  fs: FsLike
): Promise<Map<LanguageCode, Glossary>> {
  const root = await glossaryRoot(gamePath, gameDef, fs)
  const glossaries = new Map<LanguageCode, Glossary>()

  if (root === undefined) {
    for (const targetLanguage of targetLanguages) {
      glossaries.set(targetLanguage, emptyGlossary(gamePath, targetLanguage))
    }
    return glossaries
  }

  const keys = await readModKeys(root, gameDef, fs)
  for (const targetLanguage of targetLanguages) {
    glossaries.set(
      targetLanguage,
      glossaryFromKeys(keys, gamePath, root, sourceLanguage, targetLanguage)
    )
  }
  return glossaries
}

export const glossaryToStats = (glossary: Glossary): GlossaryStats => ({
  language: glossary.forLanguage,
  builtFrom: glossary.builtFrom,
  root: glossary.root,
  files: glossary.files,
  exact: glossary.exact.size,
  terms: glossary.terms.size,
  truncated: glossary.truncated
})

const describeGlossarySkip = (skipReason: GlossarySkipReason): string => {
  switch (skipReason) {
    case 'no-game-path':
      return 'No glossary was attempted: no game installation path is set for this run, so no localisation files could be read. Set the game path in the translation settings.'
    case 'no-glossary-target':
      return 'No glossary was attempted: none of the target languages is a recognized language code, so no glossary can be matched to a custom target language.'
    case 'no-user-data-path':
      return 'No glossary was attempted: no application data path was available to store the glossary cache.'
  }
}

export const describeGlossaryProblems = (report: GlossaryReport): string[] => {
  if (report.skipReason !== undefined) return [describeGlossarySkip(report.skipReason)]

  const lines: string[] = []
  for (const stat of report.stats) {
    if (stat.exact === 0) {
      lines.push(
        `No usable glossary terms for ${stat.language} : looked in ${stat.root}, found ${stat.files} file(s) but no source/target pair. Check that this path is the actual game install, not a translation mod.`
      )
    }
    if (stat.truncated) {
      lines.push(
        `The glossary for ${stat.language} was truncated while reading ${stat.root} : localisation exceeds the size limit, some terms may be missing.`
      )
    }
  }
  return lines
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
