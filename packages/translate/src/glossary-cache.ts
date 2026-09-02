import type { FsLike, GameContextRef } from '@ptt/converter'
import { posixJoin } from '@ptt/converter'
import type { LanguageCode } from '@ptt/shared'

import { buildGlossary } from './glossary.js'
import { isRecord } from './guards.js'
import type { Glossary, Hint } from './types.js'

export function glossaryCacheDir(userDataPath: string): string {
  return posixJoin(userDataPath, 'glossary')
}

export function glossaryCacheKey(
  gameId: string,
  sourceLanguage: LanguageCode,
  targetLanguage: LanguageCode
): string {
  return `${gameId}-${sourceLanguage}-${targetLanguage}`
}

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
    } catch {}
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
    return undefined
  }
  if (!isRecord(parsed)) return undefined
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
