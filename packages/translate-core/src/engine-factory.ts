import type { FsLike, GameContextRef } from '@ptt/converter-core'
import type { LanguageCode } from '@ptt/shared-types'

import { TranslationEngine } from './engine.js'
import { glossaryCacheDir, glossaryCacheKey, loadGlossary } from './glossary-cache.js'
import type { TranslationMemory } from './memory.js'
import { createProvider } from './providers/factory.js'
import type { FetchLike, TranslateConfig, TranslationCounters } from './types.js'

/**
 * Building the engine of a run, once, for both front ends.
 *
 * The desktop worker and `apps/cli` each assembled this by hand and had already drifted: with no
 * target language other than the source one the worker returned `undefined` and the run silently
 * degraded to copying with translation switched on, while the CLI threw a named error. The
 * glossary cache key, the provider and the per-run settings were spelled out twice with it.
 */
export interface EngineForRunOptions {
  config: TranslateConfig
  /** The game, for its localisation layout and for the domain the prompt describes. */
  game: GameContextRef & { id: string; domain: string }
  sourceLanguage: LanguageCode
  targetLanguages: readonly LanguageCode[]
  memory: TranslationMemory
  /** Where the glossary cache lives; no glossary is built without it. */
  userDataPath?: string
  signal?: AbortSignal
  onProgress?: (counters: TranslationCounters) => void
}

/**
 * The engine a run needs, with its glossary.
 *
 * The glossary is built for the first target language only: it costs a full read of the game's
 * own localisation, and a multi-language run reuses it.
 * @param options - See `EngineForRunOptions`
 * @param fs - The injected filesystem
 * @param fetchFn - The injected transport
 * @returns The engine
 * @throws When no target language differs from the source one, which is a request that cannot
 *   mean anything rather than a run to degrade quietly
 */
export async function createEngineForRun(
  options: EngineForRunOptions,
  fs: FsLike,
  fetchFn: FetchLike
): Promise<TranslationEngine> {
  const { config, game, sourceLanguage, targetLanguages, memory, userDataPath } = options

  const firstTarget = targetLanguages.find(language => language !== sourceLanguage)
  if (!firstTarget) {
    throw new Error('Translation needs at least one target language other than the source one')
  }

  const glossary =
    config.gamePath !== undefined && config.gamePath.length > 0 && userDataPath !== undefined
      ? await loadGlossary(
          glossaryCacheDir(userDataPath),
          config.gamePath,
          glossaryCacheKey(game.id, sourceLanguage, firstTarget),
          game,
          sourceLanguage,
          firstTarget,
          fs
        )
      : undefined

  return new TranslationEngine({
    // The game describes itself to the model here rather than in one front end's option builder:
    // set on the CLI side only, the app's runs and the CLI's produced different prompts for the
    // same game and model while sharing one translation memory.
    provider: createProvider({ domain: game.domain, ...config }, firstTarget, fetchFn),
    memory,
    batchSize: config.batchSize,
    concurrency: config.concurrency,
    retries: config.retries,
    ...(options.signal !== undefined && { signal: options.signal }),
    ...(options.onProgress !== undefined && { onProgress: options.onProgress }),
    ...(glossary !== undefined && { glossary })
  })
}
