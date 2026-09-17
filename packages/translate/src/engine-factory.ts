import type { FsLike, GameContextRef } from '@ptt/converter'
import { isLanguageCode, normalizeTargetLanguage } from '@ptt/shared/languages'
import type { LanguageCode } from '@ptt/shared/languages'

import { TranslationEngine } from './engine.js'
import { glossaryCacheDir, glossaryCacheKey, loadGlossary } from './glossary-cache.js'
import type { TranslationMemory } from './memory.js'
import { createProvider } from './providers/factory.js'
import type { FetchLike, TranslateConfig, TranslationCounters } from './types.js'

export interface EngineForRunOptions {
  config: TranslateConfig
  game: GameContextRef & { id: string; domain: string }
  sourceLanguage: LanguageCode
  targetLanguages: readonly string[]
  memory: TranslationMemory
  userDataPath?: string
  signal?: AbortSignal
  onProgress?: (counters: TranslationCounters) => void
}

export async function createEngineForRun(
  options: EngineForRunOptions,
  fs: FsLike,
  fetchFn: FetchLike
): Promise<TranslationEngine> {
  const { config, game, sourceLanguage, targetLanguages, memory, userDataPath } = options

  const translatable = targetLanguages.filter(
    language => normalizeTargetLanguage(language) !== sourceLanguage
  )
  const firstTarget = translatable[0]
  if (firstTarget === undefined) {
    throw new Error('Translation needs at least one target language other than the source one')
  }

  const glossaryTarget = translatable.find(isLanguageCode)
  const glossary =
    glossaryTarget !== undefined &&
    config.gamePath !== undefined &&
    config.gamePath.length > 0 &&
    userDataPath !== undefined
      ? await loadGlossary(
          glossaryCacheDir(userDataPath),
          config.gamePath,
          glossaryCacheKey(game.id, sourceLanguage, glossaryTarget),
          game,
          sourceLanguage,
          glossaryTarget,
          fs
        )
      : undefined

  return new TranslationEngine({
    provider: createProvider({ domain: game.domain, ...config }, firstTarget, fetchFn),
    memory,
    sourceLanguage,
    batchSize: config.batchSize,
    concurrency: config.concurrency,
    retries: config.retries,
    ...(options.signal !== undefined && { signal: options.signal }),
    ...(options.onProgress !== undefined && { onProgress: options.onProgress }),
    ...(glossary !== undefined && { glossary })
  })
}
