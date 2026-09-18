import { posixJoin } from '@ptt/converter'
import { nodeFetch, nodeFs } from '@ptt/fs-node'
import type { LanguageCode } from '@ptt/shared'
import type { FetchLike, TranslateConfig, TranslateProvider } from '@ptt/translate'
import {
  LANGUAGE_DISPLAY_NAMES,
  PROBE_MARKUP,
  PROBE_TEXTS,
  TranslationMemory,
  clearMemoryFiles,
  createProvider,
  getProviderModels,
  keptProbeMarkup
} from '@ptt/translate'

import { log } from '../log.js'

export interface TestProviderResult {
  ok: boolean
  translated?: string
  markupSource?: string
  markupAnswer?: string
  markupKept?: boolean
  error?: string
}

export interface TestProviderInput extends TranslateConfig {
  targetLanguage: LanguageCode
}

export interface ListModelsInput {
  provider: TranslateProvider
  baseUrl: string
  timeout: number
  apiKey?: string
}

export interface ListModelsResult {
  ok: boolean
  models: string[]
  error?: string
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
        PROBE_TEXTS,
        LANGUAGE_DISPLAY_NAMES[input.targetLanguage],
        LANGUAGE_DISPLAY_NAMES.en
      )
      const translated = answer[0]
      if (translated === undefined || translated.trim().length === 0) {
        return { ok: false, error: 'The backend answered nothing for the probe string' }
      }

      const markupAnswer = answer[1]
      if (markupAnswer === undefined || markupAnswer.trim().length === 0) {
        return { ok: true, translated, markupSource: PROBE_MARKUP, markupKept: false }
      }
      return {
        ok: true,
        translated,
        markupSource: PROBE_MARKUP,
        markupAnswer,
        markupKept: keptProbeMarkup(markupAnswer)
      }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async listModels(input: ListModelsInput): Promise<ListModelsResult> {
    try {
      const models = await getProviderModels({
        provider: input.provider,
        baseUrl: input.baseUrl,
        timeout: input.timeout,
        fetchFn: this.fetchFn,
        ...(input.apiKey !== undefined && { apiKey: input.apiKey })
      })
      return { ok: true, models }
    } catch (err) {
      return { ok: false, models: [], error: err instanceof Error ? err.message : String(err) }
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
