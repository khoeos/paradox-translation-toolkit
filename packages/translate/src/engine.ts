import { extractTokens, tokensMatch } from '@ptt/parser'
import { getLanguageDisplayName, normalizeTargetLanguage } from '@ptt/shared/languages'
import type { LanguageCode } from '@ptt/shared/languages'

import { backoffDelay, classifyRetry, sleep } from './backoff.js'
import type { RetryKind, SleepLike } from './backoff.js'
import { collectHints, glossaryToStats } from './glossary.js'
import { HttpFailure } from './http.js'
import type { TranslationMemory } from './memory.js'
import type {
  Glossary,
  GlossaryReport,
  GlossarySkipReason,
  GlossaryStats,
  Provider,
  Refusal,
  RefusalReason,
  TranslationCounters
} from './types.js'

export const BACKEND_DOWN_AFTER = 3

export const MAX_REMEMBERED_REFUSALS = 50_000

export const MAX_REASKS_PER_RUN = 200

const REASKABLE_REASONS: readonly RefusalReason[] = ['markup', 'empty', 'control']

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
  sourceLanguage: LanguageCode
  batchSize: number
  concurrency: number
  retries: number
  signal?: AbortSignal
  onProgress?: (counters: TranslationCounters) => void
  glossaries?: ReadonlyMap<string, Glossary>
  glossarySkipReason?: GlossarySkipReason
  sleep?: SleepLike
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
  private cooldown: Promise<void> | undefined
  private backendDown = false
  private readonly refusals = new Map<string, Refusal>()
  private droppedRefusals = 0
  private readonly reasked = new Set<string>()
  private reasks = 0
  private readonly sleepFor: SleepLike

  constructor(private readonly options: EngineOptions) {
    this.sleepFor = options.sleep ?? sleep
  }

  getCounters(): TranslationCounters {
    return { ...this.counters }
  }

  getRefusals(): { list: Refusal[]; dropped: number } {
    return { list: [...this.refusals.values()], dropped: this.droppedRefusals }
  }

  getGlossaryStats(): GlossaryStats[] {
    const glossaries = this.options.glossaries
    if (!glossaries) return []
    return [...glossaries.values()].map(glossary => glossaryToStats(glossary))
  }

  getGlossaryReport(): GlossaryReport {
    return {
      stats: this.getGlossaryStats(),
      ...(this.options.glossarySkipReason !== undefined && {
        skipReason: this.options.glossarySkipReason
      })
    }
  }

  isBackendDown(): boolean {
    return this.backendDown
  }

  refusalFor(language: string, value: string): Refusal | undefined {
    return this.refusals.get(refusalKey(language, value))
  }

  private refuse(
    language: string,
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
    language: string,
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

  private glossaryFor(language: string): Glossary | undefined {
    return this.options.glossaries?.get(normalizeTargetLanguage(language))
  }

  private async waitForCooldown(): Promise<void> {
    const pending = this.cooldown
    if (pending) await pending
  }

  private startCooldown(
    kind: RetryKind,
    retryAfterMs: number | undefined,
    throttled: number
  ): Promise<void> | undefined {
    const delay = backoffDelay(throttled, kind, retryAfterMs)
    if (delay <= 0) return undefined

    const waiting = this.sleepFor(delay, this.options.signal)
    if (kind !== 'rate-limit') return waiting

    this.cooldown = waiting
    const clear = (): void => {
      if (this.cooldown === waiting) this.cooldown = undefined
    }
    void waiting.then(clear, clear)
    return waiting
  }

  private async runBatch(
    batch: string[],
    language: string,
    results: Map<string, string>,
    stats: TranslationCounters
  ): Promise<void> {
    if (this.options.signal?.aborted) throw new TranslationFailure('cancelled')

    if (this.backendDown) this.abandonBatch(batch, language, stats)

    let answer: Array<string | undefined> | undefined
    let lastError: Error | undefined
    let lastKind: RetryKind = 'other'
    let throttled = 0

    for (let attempt = 0; attempt < this.options.retries && !answer; attempt++) {
      await this.waitForCooldown()
      if (this.options.signal?.aborted) throw new TranslationFailure('cancelled')

      const release = await this.acquire()
      if (this.backendDown) {
        release()
        this.abandonBatch(batch, language, stats)
      }
      let retryAfterMs: number | undefined
      try {
        const glossary = this.glossaryFor(language)
        const hints = glossary ? collectHints(glossary, batch) : undefined
        answer = await this.options.provider.translate(
          batch,
          getLanguageDisplayName(language),
          getLanguageDisplayName(this.options.sourceLanguage),
          hints,
          this.options.signal
        )
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        lastKind = classifyRetry(error)
        if (error instanceof HttpFailure) retryAfterMs = error.retryAfterMs
      } finally {
        release()
      }

      if (answer || lastKind === 'other') continue

      throttled++
      const lastAttempt = attempt + 1 >= this.options.retries
      if (lastAttempt && lastKind !== 'rate-limit') continue

      const waiting = this.startCooldown(lastKind, retryAfterMs, throttled)
      if (lastAttempt || !waiting) continue

      await waiting
      if (this.options.signal?.aborted) throw new TranslationFailure('cancelled')
    }

    if (!answer) {
      if (batch.length > 1 && lastKind !== 'rate-limit') {
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
      if (lastKind !== 'rate-limit') {
        this.consecutiveFailures++
        if (this.consecutiveFailures >= BACKEND_DOWN_AFTER) this.backendDown = true
      }
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

  private pickReaskable(values: readonly string[], language: string): string[] {
    const picked: string[] = []
    for (const value of values) {
      if (this.reasks >= MAX_REASKS_PER_RUN) break
      const key = refusalKey(language, value)
      const refusal = this.refusals.get(key)
      if (!refusal) continue
      if (!REASKABLE_REASONS.some(reason => reason === refusal.reason)) continue
      if (this.reasked.has(key)) continue
      this.reasked.add(key)
      this.reasks++
      picked.push(value)
    }
    return picked
  }

  private async reaskRefused(
    values: readonly string[],
    language: string,
    results: Map<string, string>,
    stats: TranslationCounters
  ): Promise<void> {
    if (this.options.signal?.aborted || this.backendDown) return

    const picked = this.pickReaskable(values, language)
    if (picked.length === 0) return

    await Promise.all(
      picked.map(async value => {
        if (this.options.signal?.aborted || this.backendDown) return
        const key = refusalKey(language, value)
        const before = this.refusals.get(key)
        await this.runBatch([value], language, results, stats).catch(() => undefined)
        if (this.refusals.get(key) === before) return
        this.counters.failed = Math.max(0, this.counters.failed - 1)
        stats.failed = Math.max(0, stats.failed - 1)
      })
    )

    this.report()
  }

  async translate(values: readonly string[], language: string): Promise<TranslateResult> {
    if (
      normalizeTargetLanguage(language) === normalizeTargetLanguage(this.options.sourceLanguage)
    ) {
      throw new Error(
        `Cannot translate into "${getLanguageDisplayName(language)}": it is the language this run ` +
          `reads from. Pick another target language.`
      )
    }

    await this.options.memory.load(language)

    const stats: TranslationCounters = { translated: 0, cached: 0, failed: 0 }

    const results = new Map<string, string>()
    const todo: string[] = []
    const waitFor: Array<Promise<void>> = []
    const unique = [...new Set(values)]
    const glossary = this.glossaryFor(language)

    const errors: string[] = []

    try {
      for (const value of unique) {
        const official = glossary?.exact.get(value)
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

        await this.reaskRefused(todo, language, results, stats)
      }
    } finally {
      for (const value of todo) {
        const key = refusalKey(language, value)
        this.inflight.get(key)?.release()
        this.inflight.delete(key)
      }
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

function refusalKey(language: string, value: string): string {
  return `${language}::${value}`
}
