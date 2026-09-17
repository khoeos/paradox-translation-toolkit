/// <reference lib="dom" />

import { HttpFailure } from './http.js'

export type RetryKind = 'rate-limit' | 'server' | 'other'

export type SleepLike = (ms: number, signal?: AbortSignal) => Promise<void>

const BASE_DELAY_MS = 500
const MAX_DELAY_MS = 15_000
const MIN_RETRY_AFTER_MS = 250
const JITTER_RATIO = 0.25
const RATE_LIMIT_FACTOR = 2

export function classifyRetry(error: unknown): RetryKind {
  if (error instanceof HttpFailure) {
    if (error.status === 429) return 'rate-limit'
    if (error.status >= 500) return 'server'
  }
  return 'other'
}

export function backoffDelay(
  consecutive: number,
  kind: RetryKind,
  retryAfterMs?: number,
  random: () => number = Math.random
): number {
  if (kind === 'other') return 0

  if (retryAfterMs !== undefined) {
    return Math.min(Math.max(retryAfterMs, MIN_RETRY_AFTER_MS), MAX_DELAY_MS)
  }

  const factor = kind === 'rate-limit' ? RATE_LIMIT_FACTOR : 1
  const exponential = BASE_DELAY_MS * factor * 2 ** consecutive
  const capped = Math.min(exponential, MAX_DELAY_MS)
  const jitterSpan = capped * JITTER_RATIO
  const jitter = (random() * 2 - 1) * jitterSpan
  return Math.min(MAX_DELAY_MS, Math.max(0, capped + jitter))
}

export const sleep: SleepLike = (ms, signal) =>
  new Promise(resolve => {
    if (signal?.aborted) {
      resolve()
      return
    }

    const onAbort = (): void => {
      clearTimeout(timer)
      resolve()
    }

    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)

    signal?.addEventListener('abort', onAbort, { once: true })
  })
