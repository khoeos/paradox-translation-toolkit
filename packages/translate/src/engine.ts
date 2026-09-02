import { extractTokens, tokensMatch } from '@ptt/parser'
import type { LanguageCode } from '@ptt/shared'

import { collectHints } from './glossary.js'
import { LANGUAGE_DISPLAY_NAMES } from './language-codes.js'
import type { TranslationMemory } from './memory.js'
import type { Glossary, Provider, Refusal, RefusalReason, TranslationCounters } from './types.js'

export const BACKEND_DOWN_AFTER = 3

export const MAX_REMEMBERED_REFUSALS = 50_000

const LAST_CONTROL_CODE = 0x1f
const DELETE_CODE = 0x7f

function hasControlCharacter(value: string): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0
    if (code <= LAST_CONTROL_CODE || code === DELETE_CODE) return true
  }
  return false
}

export class TranslationFailure extends Error {}

export interface EngineOptions {
  provider: Provider
  memory: TranslationMemory
  batchSize: number
  concurrency: number
  retries: number
  signal?: AbortSignal
  onProgress?: (counters: TranslationCounters) => void
  glossary?: Glossary
}

export interface TranslateResult {
  results: Map<string, string>
  stats: TranslationCounters
}

export function describeTokenLoss(source: string, translated: string): string {
  const before = extractTokens(source)
  const after = extractTokens(translated)
  const lost = before.filter(token => !after.includes(token))
  const added = after.filter(token => !before.includes(token))
  const parts: string[] = []
  if (lost.length > 0) parts.push(`lost ${lost.join(' ')}`)
  if (added.length > 0) parts.push(`added ${added.join(' ')}`)
  return parts.join(', ') || `token count ${before.length} became ${after.length}`
}

export class TranslationEngine {
  private readonly counters: TranslationCounters = { translated: 0, cached: 0, failed: 0 }
  private running = 0
  private readonly queue: Array<() => void> = []
  private readonly inflight = new Map<string, { done: Promise<void>; release: () => void }>()
  private consecutiveFailures = 0
  private backendDown = false
  private readonly refusals = new Map<string, Refusal>()
  private droppedRefusals = 0

  constructor(private readonly options: EngineOptions) {}

  getCounters(): TranslationCounters {
    return { ...this.counters }
  }

  getRefusals(): { list: Refusal[]; dropped: number } {
    return { list: [...this.refusals.values()], dropped: this.droppedRefusals }
  }

  isBackendDown(): boolean {
    return this.backendDown
  }

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

  private async runBatch(
    batch: string[],
    language: LanguageCode,
    results: Map<string, string>,
    stats: TranslationCounters
  ): Promise<void> {
    if (this.options.signal?.aborted) throw new TranslationFailure('cancelled')

    if (this.backendDown) this.abandonBatch(batch, language, stats)

    let answer: Array<string | undefined> | undefined
    let lastError: Error | undefined

    for (let attempt = 0; attempt < this.options.retries && !answer; attempt++) {
      const release = await this.acquire()
      if (this.backendDown) {
        release()
        this.abandonBatch(batch, language, stats)
      }
      try {
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
      if (batch.length > 1) {
        const middle = Math.ceil(batch.length / 2)
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
      if (hasControlCharacter(translated)) {
        this.refuse(language, source, 'control', 'answer carried a control character', stats)
        continue
      }
      if (!tokensMatch(source, translated)) {
        this.refuse(language, source, 'markup', describeTokenLoss(source, translated), stats)
        continue
      }
      results.set(source, translated)
      this.counters.translated++
      stats.translated++
      this.refusals.delete(refusalKey(language, source))
      await this.options.memory.set(language, source, translated)
    }

    this.report()
  }

  async translate(values: readonly string[], language: LanguageCode): Promise<TranslateResult> {
    await this.options.memory.load(language)

    const stats: TranslationCounters = { translated: 0, cached: 0, failed: 0 }

    const results = new Map<string, string>()
    const todo: string[] = []
    const waitFor: Array<Promise<void>> = []
    const unique = [...new Set(values)]

    for (const value of unique) {
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
            errors.push(error instanceof Error ? error.message : String(error))
          }
        })
      )
    }

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
