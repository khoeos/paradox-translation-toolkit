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

const PROBE_TEXT = 'Colony Ship'

export interface TestProviderResult {
  ok: boolean
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

  async testProvider(input: TestProviderInput): Promise<TestProviderResult> {
    try {
      const provider = createProvider(input, input.targetLanguage, this.fetchFn)
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

  async clearMemory(gameId?: string): Promise<{ cleared: boolean }> {
    const root = posixJoin(this.userDataPath, 'translation-memory')
    const target = gameId === undefined ? root : posixJoin(root, gameId)
    try {
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

export { TranslationMemory }
