import { describe, expect, it } from 'vitest'

import { backoffDelay, classifyRetry, sleep } from '../src/backoff.js'
import { HttpFailure } from '../src/http.js'

describe('classifyRetry', () => {
  it('reads a rate-limit failure as rate-limit', () => {
    expect(classifyRetry(new HttpFailure('HTTP 429 Too Many Requests', 429))).toBe('rate-limit')
  })

  it('reads a 503 failure as server', () => {
    expect(classifyRetry(new HttpFailure('HTTP 503 Service Unavailable', 503))).toBe('server')
  })

  it('reads a 400 failure as other', () => {
    expect(classifyRetry(new HttpFailure('HTTP 400 Bad Request', 400))).toBe('other')
  })

  it('reads an ordinary error as other', () => {
    expect(classifyRetry(new Error('socket hang up'))).toBe('other')
  })

  it('reads a non-Error value as other', () => {
    expect(classifyRetry('boom')).toBe('other')
  })
})

describe('backoffDelay', () => {
  it('is always 0 for other, whatever the counter', () => {
    expect(backoffDelay(0, 'other')).toBe(0)
    expect(backoffDelay(1, 'other')).toBe(0)
    expect(backoffDelay(20, 'other')).toBe(0)
  })

  it('grows with the consecutive count', () => {
    const early = backoffDelay(1, 'server', undefined, () => 0.5)
    const later = backoffDelay(4, 'server', undefined, () => 0.5)
    expect(later).toBeGreaterThan(early)
  })

  it('caps at 15 seconds for a high counter', () => {
    expect(backoffDelay(50, 'server', undefined, () => 1)).toBeLessThanOrEqual(15_000)
    expect(backoffDelay(50, 'rate-limit', undefined, () => 1)).toBeLessThanOrEqual(15_000)
  })

  it('stays within the jitter band at the low end', () => {
    const delay = backoffDelay(2, 'server', undefined, () => 0)
    expect(delay).toBeGreaterThanOrEqual(0)
    expect(delay).toBeLessThanOrEqual(15_000)
  })

  it('stays within the jitter band at the high end', () => {
    const delay = backoffDelay(2, 'server', undefined, () => 1)
    expect(delay).toBeLessThanOrEqual(15_000)
    expect(delay).toBeGreaterThan(backoffDelay(2, 'server', undefined, () => 0))
  })

  it('lets a retryAfterMs value override the computed delay', () => {
    expect(backoffDelay(0, 'rate-limit', 2_000, () => 0)).toBe(2_000)
  })

  it('still bounds a retryAfterMs value to the cap', () => {
    expect(backoffDelay(0, 'rate-limit', 60_000, () => 0)).toBe(15_000)
  })

  it('keeps a short wait when the server asks for an immediate retry', () => {
    const delay = backoffDelay(0, 'rate-limit', 0, () => 0)
    expect(delay).toBeGreaterThan(0)
    expect(delay).toBeLessThan(1_000)
  })

  it('falls back to the curve when no retryAfterMs could be read', () => {
    expect(backoffDelay(0, 'rate-limit', undefined, () => 0)).toBeGreaterThan(0)
    expect(backoffDelay(5, 'rate-limit', undefined, () => 0)).toBeGreaterThan(
      backoffDelay(0, 'rate-limit', undefined, () => 0)
    )
  })
})

describe('sleep', () => {
  it('resolves after roughly the given delay', async () => {
    const start = Date.now()
    await sleep(20)
    expect(Date.now() - start).toBeGreaterThanOrEqual(10)
  })

  it('resolves immediately when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const start = Date.now()
    await sleep(5_000, controller.signal)
    expect(Date.now() - start).toBeLessThan(500)
  })

  it('resolves as soon as the signal aborts mid-wait', async () => {
    const controller = new AbortController()
    const start = Date.now()
    const promise = sleep(5_000, controller.signal)
    controller.abort()
    await promise
    expect(Date.now() - start).toBeLessThan(500)
  })
})
