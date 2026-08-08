import { describe, expect, it } from 'vitest'

import { mapWithConcurrency } from '../src/index.js'

/** Resolves only when `release()` is called, so a test can hold a runner hostage. */
function gate(): { promise: Promise<void>; release: () => void } {
  let resolver: (() => void) | undefined
  const promise = new Promise<void>(resolve => {
    resolver = resolve
  })
  return { promise, release: () => resolver?.() }
}

/** Lets every pending microtask run, without pulling a timer into the test. */
async function flush(): Promise<void> {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

describe('mapWithConcurrency', () => {
  it('returns the results in the order of the items, not of completion', async () => {
    // The first item finishes last, so a naive push-on-completion would reverse the list.
    const held = gate()
    const all = mapWithConcurrency([0, 1, 2, 3], 4, async item => {
      if (item === 0) await held.promise
      return item
    })
    await flush()
    held.release()
    expect(await all).toEqual([0, 1, 2, 3])
  })

  it('passes the index alongside the item', async () => {
    const out = await mapWithConcurrency(['a', 'b', 'c'], 2, async (item, index) =>
      Promise.resolve(`${index}:${item}`)
    )
    expect(out).toEqual(['0:a', '1:b', '2:c'])
  })

  it('never runs more than `limit` tasks at once', async () => {
    let running = 0
    let peak = 0
    await mapWithConcurrency(
      Array.from({ length: 20 }, (_, i) => i),
      3,
      async () => {
        running++
        peak = Math.max(peak, running)
        await Promise.resolve()
        running--
      }
    )
    expect(peak).toBeLessThanOrEqual(3)
  })

  it('keeps the other runners going while one item is slow', async () => {
    // This is why the pool pulls from a cursor instead of processing fixed chunks.
    const held = gate()
    const done: number[] = []
    const all = mapWithConcurrency([0, 1, 2, 3], 2, async item => {
      if (item === 0) await held.promise
      done.push(item)
      return item
    })
    await flush()
    expect(done).toEqual([1, 2, 3])
    held.release()
    expect(await all).toEqual([0, 1, 2, 3])
  })

  it('handles an empty list without spawning a runner', async () => {
    let calls = 0
    const out = await mapWithConcurrency([], 8, async () => {
      calls++
      return 1
    })
    expect(out).toEqual([])
    expect(calls).toBe(0)
  })

  it('caps the pool at the item count', async () => {
    const out = await mapWithConcurrency([1], 100, async n => n * 2)
    expect(out).toEqual([2])
  })

  it('treats a limit below 1 as 1 rather than deadlocking', async () => {
    const out = await mapWithConcurrency([1, 2], 0, async n => n)
    expect(out).toEqual([1, 2])
  })

  it('propagates a rejection', async () => {
    await expect(
      mapWithConcurrency([1, 2], 2, async n => {
        if (n === 2) throw new Error('boom')
        return n
      })
    ).rejects.toThrow('boom')
  })
})
