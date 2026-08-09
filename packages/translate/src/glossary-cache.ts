import type { FsLike, GameContextRef } from '@ptt/converter'
import { posixJoin } from '@ptt/converter'
import type { LanguageCode } from '@ptt/shared'

import { buildGlossary } from './glossary.js'
import { isRecord } from './guards.js'
import type { Glossary, Hint } from './types.js'

/*
 * Ported from PR #4 (e21ee7a, `src/main/translate/glossary.ts` `loadGlossary`) by
 * Artem Kondrashev.
 */

/** Where the glossary cache lives, so both front ends warm and read the same one. */
export function glossaryCacheDir(userDataPath: string): string {
  return posixJoin(userDataPath, 'glossary')
}

/** What makes a cached glossary reusable: one game, one language pair. */
export function glossaryCacheKey(
  gameId: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode
): string {
  return `${gameId}-${sourceLanguage}-${targetLanguage}`
}

/**
 * Load a cached glossary, or build and cache it.
 *
 * The cache is invalidated by strict equality of the game path only. Known limitation: a game
 * patch at the same install path serves a stale term until the cache is cleared. Rebuilding is
 * cheap enough that the cache is only a convenience.
 * @param cacheDir - Where the cache lives
 * @param gamePath - The game installation folder
 * @param cacheKey - Distinguishes game and language pair
 * @param gameDef - The game
 * @param sourceLanguage - The language mod strings are written in
 * @param targetLanguage - The language to translate into
 * @param fs - The injected filesystem
 * @returns The glossary
 */
export async function loadGlossary(
  cacheDir: string,
  gamePath: string,
  cacheKey: string,
  gameDef: GameContextRef,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode,
  fs: FsLike
): Promise<Glossary> {
  const file = posixJoin(cacheDir, `${cacheKey.replace(/[^a-z0-9_-]/gi, '_')}.json`)

  const cached = await readCache(file, gamePath, fs)
  if (cached) return cached

  const glossary = await buildGlossary(gamePath, gameDef, sourceLanguage, targetLanguage, fs)

  if (glossary.exact.size > 0) {
    try {
      await fs.mkdir(cacheDir, { recursive: true })
      const temporary = `${file}.tmp`
      await fs.writeFile(
        temporary,
        JSON.stringify({
          builtFrom: glossary.builtFrom,
          files: glossary.files,
          exact: [...glossary.exact],
          terms: [...glossary.terms]
        }),
        'utf-8'
      )
      await fs.rename(temporary, file)
    } catch {
      // A cache that cannot be written just means rebuilding next time.
    }
  }

  return glossary
}

async function readCache(
  file: string,
  gamePath: string,
  fs: FsLike
): Promise<Glossary | undefined> {
  let parsed: unknown
  try {
    parsed = JSON.parse(await fs.readFile(file, 'utf-8'))
  } catch {
    // No cache, or an unreadable one: rebuilding is always correct.
    return undefined
  }
  if (!isRecord(parsed)) return undefined
  // A cache built from another installation says nothing about this one.
  if (parsed.builtFrom !== gamePath) return undefined

  const exact = readStringPairs(parsed.exact)
  const terms = readHintPairs(parsed.terms)
  if (!exact || !terms) return undefined

  return {
    exact,
    terms,
    builtFrom: gamePath,
    files: typeof parsed.files === 'number' ? parsed.files : 0
  }
}

function readStringPairs(value: unknown): Map<string, string> | undefined {
  if (!Array.isArray(value)) return undefined
  const out = new Map<string, string>()
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length !== 2) return undefined
    const [key, mapped] = pair
    if (typeof key !== 'string' || typeof mapped !== 'string') return undefined
    out.set(key, mapped)
  }
  return out
}

function readHintPairs(value: unknown): Map<string, Hint> | undefined {
  if (!Array.isArray(value)) return undefined
  const out = new Map<string, Hint>()
  for (const pair of value) {
    if (!Array.isArray(pair) || pair.length !== 2) return undefined
    const [key, hint] = pair
    if (typeof key !== 'string' || !isRecord(hint)) return undefined
    if (typeof hint.source !== 'string' || typeof hint.target !== 'string') return undefined
    out.set(key, { source: hint.source, target: hint.target })
  }
  return out
}
