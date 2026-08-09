import { extractTokens, tokensMatch } from '@ptt/parser'
import type { LanguageCode } from '@ptt/shared'

import { collectHints } from './glossary.js'
import { LANGUAGE_DISPLAY_NAMES } from './language-codes.js'
import type { TranslationMemory } from './memory.js'
import type { Glossary, Provider, Refusal, RefusalReason, TranslationCounters } from './types.js'

/*
 * Ported from PR #4 (e21ee7a, `src/main/translate/engine.ts`) by Artem Kondrashev.
 */

/** Single strings failing in a row before the backend is declared unreachable. */
export const BACKEND_DOWN_AFTER = 3

/**
 * Refusals are kept string by string so a run can be read back key by key. A collection-wide
 * run can refuse tens of thousands of strings, and holding them all would cost more memory
 * than the translations themselves.
 */
export const MAX_REMEMBERED_REFUSALS = 50_000

/** Highest code point still counted as a control character. */
const LAST_CONTROL_CODE = 0x1f
const DELETE_CODE = 0x7f

/**
 * Whether a string carries a control character.
 *
 * A real newline or tab would break the `key:0 "..."` line of the generated file and let a
 * crafted answer inject fake keys into something the game loads (audit finding S-3). Checked by
 * code point rather than by regexp, so the intent is readable and no lint rule has to be muted.
 */
function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code <= LAST_CONTROL_CODE || code === DELETE_CODE) return true
  }
  return false
}

/** A batch that could not be translated even one string at a time. */
export class TranslationFailure extends Error {}

export interface EngineOptions {
  provider: Provider
  memory: TranslationMemory
  /** Strings sent per request. */
  batchSize: number
  /** Requests in flight at once. The backend is the bottleneck. */
  concurrency: number
  /** Attempts before a batch is split. */
  retries: number
  signal?: AbortSignal
  onProgress?: (counters: TranslationCounters) => void
  glossary?: Glossary
}

export interface TranslateResult {
  /** Source to translation. A missing entry must stay in the source language. */
  results: Map<string, string>
  /** What this call did, not what the engine has done since it was built. */
  stats: TranslationCounters
}

/**
 * Name the markup the translator lost or invented. A bare "markup" tells nobody what to fix.
 * @param source - The source string
 * @param translated - What came back
 * @returns A short description of the difference
 */
export function describeTokenLoss(source: string, translated: string): string {
  const before = extractTokens(source)
  const after = extractTokens(translated)
  const lost = before.filter(token => !after.includes(token))
  const added = after.filter(token => !before.includes(token))
  const parts: string[] = []
  if (lost.length > 0) parts.push(`lost ${lost.join(' ')}`)
  if (added.length > 0) parts.push(`added ${added.join(' ')}`)
  // Same tokens on both sides but a different count: one of them was duplicated.
  return parts.join(', ') || `token count ${before.length} became ${after.length}`
}

/**
 * Turns a pile of source strings into translations.
 *
 * Everything expensive is guarded here: the memory answers repeats for free, batches are split
 * rather than dropped when a call fails, and a translation that lost a markup token is refused
 * so a broken string never reaches a localisation file.
 */
export class TranslationEngine {
  private readonly counters: TranslationCounters = { translated: 0, cached: 0, failed: 0 }
  private running = 0
  private readonly queue: Array<() => void> = []
  /** Strings another mod is already translating, so the same text is never sent twice. */
  private readonly inflight = new Map<string, { done: Promise<void>; release: () => void }>()
  /** Single strings that failed in a row: a dead backend must not be retried forever. */
  private consecutiveFailures = 0
  private backendDown = false
  /**
   * Strings left in the source language, so a later success can clear one. Keyed by language
   * and value: the original keyed by value alone, so a refusal recorded while translating
   * Russian was readable, and clearable, while translating French on the same engine.
   */
  private readonly refusals = new Map<string, Refusal>()
  /** Refusals dropped once the cap was reached, so the report can say the list is partial. */
  private droppedRefusals = 0

  constructor(private readonly options: EngineOptions) {}

  getCounters(): TranslationCounters {
    return { ...this.counters }
  }

  /** Every string that stayed in the source language, and why. */
  getRefusals(): { list: Refusal[]; dropped: number } {
    return { list: [...this.refusals.values()], dropped: this.droppedRefusals }
  }

  /** Whether the backend was declared unreachable, so the caller can say so once. */
  isBackendDown(): boolean {
    return this.backendDown
  }

  /**
   * Why one string was left alone.
   * @param language - The target language
   * @param value - The source string
   * @returns The refusal, or undefined when this string never failed in this language
   */
  refusalFor(language: LanguageCode, value: string): Refusal | undefined {
    return this.refusals.get(refusalKey(language, value))
  }

  private refuse(
    language: LanguageCode,
    value: string,
    reason: RefusalReason,
    detail: string | undefined,
    stats: TranslationCounters
  ): void {
    this.counters.failed++
    stats.failed++
    const key = refusalKey(language, value)
    if (this.refusals.size >= MAX_REMEMBERED_REFUSALS && !this.refusals.has(key)) {
      this.droppedRefusals++
      return
    }
    this.refusals.set(key, {
      value,
      language,
      reason,
      ...(detail !== undefined && { detail })
    })
  }

  /** Give up on a whole batch because the backend was declared unreachable. */
  private abandonBatch(
    batch: readonly string[],
    language: LanguageCode,
    stats: TranslationCounters
  ): never {
    for (const value of batch) {
      this.refuse(language, value, 'backend', 'backend already declared down', stats)
    }
    this.report()
    throw new TranslationFailure('translation backend is down')
  }

  /**
   * Backends are the bottleneck: never hit them with more calls than asked for.
   *
   * A release hands its slot straight to the next waiter rather than freeing it and letting the
   * waiter take it back: the waiter only resumes on a later microtask, so anything calling
   * `acquire()` synchronously in between (the retry loop does, right after its `finally`) took
   * the same slot and the pool ran one over the limit.
   */
  private async acquire(): Promise<() => void> {
    if (this.running >= this.options.concurrency) {
      await new Promise<void>(resolve => this.queue.push(resolve))
    } else {
      this.running++
    }
    return () => {
      const next = this.queue.shift()
      if (next) next()
      else this.running--
    }
  }

  private report(): void {
    this.options.onProgress?.(this.getCounters())
  }

  /**
   * Translate one batch, splitting it instead of losing it when the backend misbehaves.
   * @param batch - The source strings
   * @param language - The target language
   * @param results - Collects the translations
   */
  private async runBatch(
    batch: string[],
    language: LanguageCode,
    results: Map<string, string>,
    stats: TranslationCounters
  ): Promise<void> {
    // Stopping must be felt at once, not after the whole language finished.
    if (this.options.signal?.aborted) throw new TranslationFailure('cancelled')

    // Once the backend is gone, every further call would only burn a timeout.
    if (this.backendDown) this.abandonBatch(batch, language, stats)

    let answer: Array<string | undefined> | undefined
    let lastError: Error | undefined

    for (let attempt = 0; attempt < this.options.retries && !answer; attempt++) {
      const release = await this.acquire()
      // Re-checked after queueing, not only on entry: a batch can wait a long time behind the
      // others, and the backend may have died meanwhile. Without this, every batch already
      // past the entry check still burns a full timeout against a backend known to be dead.
      if (this.backendDown) {
        release()
        this.abandonBatch(batch, language, stats)
      }
      try {
        // Only the terms this batch actually uses: the glossary holds a hundred thousand.
        const hints = this.options.glossary ? collectHints(this.options.glossary, batch) : undefined
        answer = await this.options.provider.translate(
          batch,
          LANGUAGE_DISPLAY_NAMES[language],
          hints,
          this.options.signal
        )
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      } finally {
        release()
      }
    }

    if (!answer) {
      // A smaller batch often survives a timeout or a truncated answer.
      if (batch.length > 1) {
        const middle = Math.ceil(batch.length / 2)
        // Both halves must be attempted: giving up on the first would leave the strings of
        // the second neither translated nor counted.
        const halves = await Promise.allSettled([
          this.runBatch(batch.slice(0, middle), language, results, stats),
          this.runBatch(batch.slice(middle), language, results, stats)
        ])
        if (halves.every(half => half.status === 'rejected')) {
          throw new TranslationFailure(lastError?.message ?? 'unknown error')
        }
        return
      }

      for (const value of batch) {
        this.refuse(language, value, 'backend', lastError?.message, stats)
      }
      if (this.options.signal?.aborted) throw new TranslationFailure('cancelled')
      if (++this.consecutiveFailures >= BACKEND_DOWN_AFTER) this.backendDown = true
      this.report()
      throw new TranslationFailure(lastError?.message ?? 'unknown error')
    }

    this.consecutiveFailures = 0

    for (const [index, source] of batch.entries()) {
      const translated = answer[index]?.trim()
      if (!translated) {
        this.refuse(language, source, 'empty', undefined, stats)
        continue
      }
      // A real newline or tab would break the `key:0 "..."` line and let a crafted answer
      // inject fake keys into a file the game loads (audit finding S-3).
      if (hasControlCharacter(translated)) {
        this.refuse(language, source, 'control', 'answer carried a control character', stats)
        continue
      }
      // A translation that dropped a $VARIABLE$ would break the string in game.
      if (!tokensMatch(source, translated)) {
        this.refuse(language, source, 'markup', describeTokenLoss(source, translated), stats)
        continue
      }
      results.set(source, translated)
      this.counters.translated++
      stats.translated++
      // The same string can fail for one mod and land for the next one: keep the last word.
      this.refusals.delete(refusalKey(language, source))
      await this.options.memory.set(language, source, translated)
    }

    this.report()
  }

  /**
   * Translate a set of source strings.
   * @param values - The source strings, duplicates are fine
   * @param language - The target language
   * @returns Source to translation, and what this call alone did
   */
  async translate(values: readonly string[], language: LanguageCode): Promise<TranslateResult> {
    await this.options.memory.load(language)

    // Accumulated by the code that does the work rather than read as a delta on the shared
    // counters: two mods translate at once on one engine, so a before/after subtraction gave
    // per-mod stats that could come out negative or doubled (audit finding S-11).
    const stats: TranslationCounters = { translated: 0, cached: 0, failed: 0 }

    const results = new Map<string, string>()
    const todo: string[] = []
    const waitFor: Array<Promise<void>> = []
    const unique = [...new Set(values)]

    // Claiming is synchronous, so two mods can never claim the same string.
    for (const value of unique) {
      // The base game already says it officially: no model can do better and it costs nothing.
      const official = this.options.glossary?.exact.get(value)
      if (official) {
        results.set(value, official)
        this.counters.cached++
        stats.cached++
        continue
      }

      const known = this.options.memory.get(language, value)
      if (known) {
        results.set(value, known)
        this.counters.cached++
        stats.cached++
        continue
      }

      const key = refusalKey(language, value)
      const pending = this.inflight.get(key)
      if (pending) {
        waitFor.push(pending.done)
        continue
      }

      let resolver: (() => void) | undefined
      const done = new Promise<void>(resolve => {
        resolver = resolve
      })
      this.inflight.set(key, { done, release: () => resolver?.() })
      todo.push(value)
    }

    if (stats.cached > 0) this.report()

    const errors: string[] = []
    if (todo.length > 0) {
      const batches: string[][] = []
      for (let index = 0; index < todo.length; index += this.options.batchSize) {
        batches.push(todo.slice(index, index + this.options.batchSize))
      }

      await Promise.all(
        batches.map(async batch => {
          if (this.options.signal?.aborted) return
          try {
            await this.runBatch(batch, language, results, stats)
          } catch (error) {
            // One dead batch leaves its strings in the source language, the run goes on.
            errors.push(error instanceof Error ? error.message : String(error))
          }
        })
      )
    }

    // Release before waiting: two mods waiting on each other would otherwise never finish.
    for (const value of todo) {
      const key = refusalKey(language, value)
      this.inflight.get(key)?.release()
      this.inflight.delete(key)
    }

    if (waitFor.length > 0) {
      await Promise.all(waitFor)
      for (const value of unique) {
        if (results.has(value)) continue
        const known = this.options.memory.get(language, value)
        if (known) {
          results.set(value, known)
          this.counters.cached++
          stats.cached++
        }
      }
      this.report()
    }

    if (errors.length > 0 && results.size === 0) {
      throw new Error(`Translation backend unreachable: ${errors[0]}`)
    }

    return { results, stats }
  }
}

function refusalKey(language: LanguageCode, value: string): string {
  return `${language}::${value}`
}
