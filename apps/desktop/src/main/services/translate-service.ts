import { posixJoin } from '@ptt/converter'
import { nodeFetch, nodeFs } from '@ptt/fs-node'
import type { LanguageCode } from '@ptt/shared'
import type { FetchLike, TranslateConfig } from '@ptt/translate'
import {
  LANGUAGE_DISPLAY_NAMES,
  TranslationMemory,
  clearMemoryFiles,
  createProvider
} from '@ptt/translate'

import { log } from '../log.js'

/**
 * The translation side effects the UI can trigger directly.
 *
 * Ported from PR #4 (e21ee7a, the `TEST_PROVIDER` and `CLEAR_MEMORY` IPC channels) by
 * Artem Kondrashev. Both are short, so they run on the main process rather than in a worker.
 */

/** What the smoke test asks the backend to translate. Short, and unmistakably wrong if mangled. */
const PROBE_TEXT = 'Colony Ship'

export interface TestProviderResult {
  ok: boolean
  /** What came back, so the user can judge the quality rather than just the connectivity. */
  translated?: string
  error?: string
}

export interface TestProviderInput extends TranslateConfig {
  targetLanguage: LanguageCode
}

export class TranslateService {
  constructor(
    private readonly userDataPath: string,
    private readonly fetchFn: FetchLike
  ) {}

  /** One round trip against the configured backend. */
  async testProvider(input: TestProviderInput): Promise<TestProviderResult> {
    try {
      const provider = createProvider(input, input.targetLanguage, this.fetchFn)
      // The display name, not the code: that is what the prompt interpolates, and it is what a
      // real run sends. A probe built on "to ru" would not exercise the same prompt at all.
      const answer = await provider.translate(
        [PROBE_TEXT],
        LANGUAGE_DISPLAY_NAMES[input.targetLanguage]
      )
      const translated = answer[0]
      if (translated === undefined || translated.trim().length === 0) {
        return { ok: false, error: 'The backend answered nothing for the probe string' }
      }
      return { ok: true, translated }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  /**
   * Forget every translation learnt so far.
   *
   * Scoped to one game when asked, because the memory is now stored per game and per model
   * (audit finding S-7) and losing a whole collection's work to clear one game would be rude.
   * @param gameId - The game to forget, or every game when left out
   */
  async clearMemory(gameId?: string): Promise<{ cleared: boolean }> {
    const root = posixJoin(this.userDataPath, 'translation-memory')
    const target = gameId === undefined ? root : posixJoin(root, gameId)
    try {
      // `clearMemoryFiles` lives with `TranslationMemory`, which is the only thing that knows
      // which file names it writes: the rule used to be spelled out here and in the CLI too.
      await clearMemoryFiles(target, nodeFs)
      return { cleared: true }
    } catch (err) {
      log.error(`Failed to clear the translation memory at ${target}: ${String(err)}`)
      return { cleared: false }
    }
  }
}

export function createTranslateService(userDataPath: string): TranslateService {
  return new TranslateService(userDataPath, nodeFetch)
}

/** Exported for the tests, which build a memory over the in-memory filesystem instead. */
export { TranslationMemory }
