import type { FsLike, GameContextRef } from '@ptt/converter'
import { posixJoin } from '@ptt/converter'
import type { LanguageCode } from '@ptt/shared'

import { buildGlossaries } from './glossary.js'
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

function glossaryCacheFile(cacheDir: string, cacheKey: string): string {
  return posixJoin(cacheDir, `${cacheKey.replace(/[^a-z0-9_-]/gi, '_')}.json`)
}

async function writeGlossaryCache(
  file: string,
  cacheDir: string,
  glossary: Glossary,
  fs: FsLike
): Promise<void> {
  if (glossary.exact.size === 0) return
  try {
    await fs.mkdir(cacheDir, { recursive: true })
    const temporary = `${file}.tmp`
    await fs.writeFile(
      temporary,
      JSON.stringify({
        builtFrom: glossary.builtFrom,
        root: glossary.root,
        files: glossary.files,
        truncated: glossary.truncated,
        exact: [...glossary.exact],
        terms: [...glossary.terms]
      }),
      'utf-8'
    )
    await fs.rename(temporary, file)
  } catch {}
}

export async function loadGlossaries(
  cacheDir: string,
  gamePath: string,
  gameId: string,
  gameDef: GameContextRef,
  sourceLanguage: LanguageCode,
  targetLanguages: readonly LanguageCode[],
  fs: FsLike
): Promise<Map<LanguageCode, Glossary>> {
  const glossaries = new Map<LanguageCode, Glossary>()
  const missing: LanguageCode[] = []

  for (const targetLanguage of targetLanguages) {
    const file = glossaryCacheFile(
      cacheDir,
      glossaryCacheKey(gameId, sourceLanguage, targetLanguage)
    )
    const cached = await readCache(file, gamePath, targetLanguage, fs)
    if (cached) glossaries.set(targetLanguage, cached)
    else missing.push(targetLanguage)
  }

  if (missing.length > 0) {
    const built = await buildGlossaries(gamePath, gameDef, sourceLanguage, missing, fs)
    for (const targetLanguage of missing) {
      const glossary = built.get(targetLanguage)
      if (!glossary) continue
      glossaries.set(targetLanguage, glossary)
      const file = glossaryCacheFile(
        cacheDir,
        glossaryCacheKey(gameId, sourceLanguage, targetLanguage)
      )
      await writeGlossaryCache(file, cacheDir, glossary, fs)
    }
  }

  return glossaries
}

async function readCache(
  file: string,
  gamePath: string,
  targetLanguage: LanguageCode,
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

  const root = parsed.root
  if (typeof root !== 'string' || root.length === 0) return undefined

  const exact = readStringPairs(parsed.exact)
  const terms = readHintPairs(parsed.terms)
  if (!exact || !terms) return undefined

  return {
    exact,
    terms,
    builtFrom: gamePath,
    root,
    files: typeof parsed.files === 'number' ? parsed.files : 0,
    truncated: typeof parsed.truncated === 'boolean' ? parsed.truncated : false,
    forLanguage: targetLanguage
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
