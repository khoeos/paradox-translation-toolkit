import type { LanguageCode } from '@ptt/shared'

/*
 * Ported from PR #4 (e21ee7a, `src/main/translate/*` and `src/global/types.ts`) by
 * Artem Kondrashev.
 */

export const TRANSLATE_PROVIDERS = ['ollama', 'openai', 'rapidapi'] as const

export type TranslateProvider = (typeof TRANSLATE_PROVIDERS)[number]

/**
 * The transport contract now lives in `@ptt/shared`, re-exported here so every call site is
 * unchanged. It moved for the same reason `FsLike` did: `@ptt/fs-node` had to depend on this
 * whole package to name three interfaces describing a `fetch`.
 */
export type { FetchLike, FetchInit, FetchResponse } from '@ptt/shared'

/** Wording taken from the game itself, for terms occurring in one batch. */
export interface Hint {
  source: string
  target: string
}

/** A batch translator, whatever backend actually does the work. */
export interface Provider {
  /**
   * Translate a batch of strings.
   * @param texts - The strings to translate
   * @param language - The target language, spelled in English (Russian, German, ...)
   * @param hints - Wording taken from the game itself for terms occurring in this batch
   * @param signal - Cancellation, both the per-request timeout and the run-wide stop
   * @returns One slot per input, in the same order. `undefined` where the backend answered
   *   nothing usable, so the caller refuses that string rather than writing a coercion of it.
   */
  translate(
    texts: readonly string[],
    language: string,
    hints?: readonly Hint[],
    signal?: AbortSignal
  ): Promise<Array<string | undefined>>
}

export interface TranslateConfig {
  enabled: boolean
  provider: TranslateProvider
  baseUrl: string
  model: string
  apiKey?: string
  /** Strings sent per request. */
  batchSize: number
  /** Requests in flight at once. */
  concurrency: number
  /** Attempts before a batch is split. */
  retries: number
  /** Per-request timeout in milliseconds. */
  timeout: number
  /** What the game is about, so a trait is not translated as a common noun. */
  domain?: string
  /** Game installation folder: its own localisation is the best glossary there is. */
  gamePath?: string
}

export interface TranslationCounters {
  /** Strings answered by the backend. */
  translated: number
  /** Strings served by the memory or the glossary: they cost nothing. */
  cached: number
  /** Strings kept in the source language because the backend failed or broke the markup. */
  failed: number
}

/** Why a string was left in the source language. */
export type RefusalReason =
  /** The translation lost or invented a markup token, writing it would break the string. */
  | 'markup'
  /** The backend answered nothing for this slot. */
  | 'empty'
  /** The call itself failed, down to a batch of one. */
  | 'backend'
  /** The answer carried a control character, which would break the generated file. */
  | 'control'

export interface Refusal {
  /** The source string, which is what identifies it across mods. */
  value: string
  /** The target language, so a refusal for one language is not read as one for another. */
  language: LanguageCode
  reason: RefusalReason
  /** Backend message, when there was one. */
  detail?: string
}

/**
 * Official translations taken from the game itself.
 *
 * Mod strings constantly reuse the vocabulary of the base game, and that vocabulary has a
 * settled rendering a model cannot guess: CK3 renders "Men-at-Arms" in Russian as
 * "Профессионалы", where a model reaches for "Наёмники", which is a different thing in game.
 * Rather than describe the game and hope, the wording is read from the game.
 */
export interface Glossary {
  /** Whole source strings the game already translates, used as-is without asking a model. */
  exact: Map<string, string>
  /** Short terms, keyed lowercased, injected into the prompt when they occur in a batch. */
  terms: Map<string, Hint>
  /** Where it came from, so a cache built for another install is not reused. */
  builtFrom: string
  files: number
}
