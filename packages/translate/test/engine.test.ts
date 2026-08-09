import { describe, expect, it } from 'vitest'

import { MemoryFs } from '@ptt/converter/test/memory-fs'

import {
  BACKEND_DOWN_AFTER,
  TranslationEngine,
  TranslationMemory,
  describeTokenLoss
} from '../src/index.js'
import type { EngineOptions, Glossary, Hint, Provider, TranslationCounters } from '../src/index.js'

/** A provider driven by a lookup table, so no network and no model are involved. */
function tableProvider(
  table: Record<string, string | undefined>,
  onCall?: (texts: readonly string[], hints?: readonly Hint[]) => void
): Provider {
  return {
    translate: async (texts, _language, hints) => {
      onCall?.(texts, hints)
      return texts.map(text => table[text])
    }
  }
}

/** A provider that fails a given number of times before answering. */
function flakyProvider(failures: number, table: Record<string, string>): Provider {
  let seen = 0
  return {
    translate: async texts => {
      if (seen++ < failures) throw new Error('connection refused')
      return texts.map(text => table[text])
    }
  }
}

async function engineWith(over: Partial<EngineOptions> = {}): Promise<TranslationEngine> {
  const memory = over.memory ?? new TranslationMemory('mem', new MemoryFs())
  return new TranslationEngine({
    provider: tableProvider({}),
    memory,
    batchSize: 10,
    concurrency: 2,
    retries: 1,
    ...over
  })
}

describe('TranslationEngine - happy path', () => {
  it('translates what the provider answers', async () => {
    const engine = await engineWith({ provider: tableProvider({ one: 'un', two: 'deux' }) })
    const { results, stats } = await engine.translate(['one', 'two'], 'fr')
    expect(results.get('one')).toBe('un')
    expect(results.get('two')).toBe('deux')
    expect(stats).toEqual({ translated: 2, cached: 0, failed: 0 })
  })

  it('sends each string once even when it repeats', async () => {
    let sent: readonly string[] = []
    const engine = await engineWith({
      provider: tableProvider({ one: 'un' }, texts => {
        sent = texts
      })
    })
    await engine.translate(['one', 'one', 'one'], 'fr')
    expect(sent).toEqual(['one'])
  })

  it('remembers what it translated', async () => {
    const memory = new TranslationMemory('mem', new MemoryFs())
    const engine = await engineWith({ memory, provider: tableProvider({ one: 'un' }) })
    await engine.translate(['one'], 'fr')
    expect(memory.get('fr', 'one')).toBe('un')
  })

  it('serves a remembered string without calling the provider', async () => {
    const fs = new MemoryFs({ 'mem/fr.json': '{"one":"un"}' })
    const memory = new TranslationMemory('mem', fs)
    let called = false
    const engine = await engineWith({
      memory,
      provider: tableProvider({}, () => {
        called = true
      })
    })
    const { results, stats } = await engine.translate(['one'], 'fr')
    expect(results.get('one')).toBe('un')
    expect(stats.cached).toBe(1)
    expect(called).toBe(false)
  })

  it('splits the work into batches of the configured size', async () => {
    const sizes: number[] = []
    const engine = await engineWith({
      batchSize: 2,
      provider: tableProvider({ a: 'a', b: 'b', c: 'c' }, texts => sizes.push(texts.length))
    })
    await engine.translate(['a', 'b', 'c'], 'fr')
    expect(sizes.toSorted()).toEqual([1, 2])
  })

  it('reports progress as it goes', async () => {
    const seen: TranslationCounters[] = []
    const engine = await engineWith({
      provider: tableProvider({ one: 'un' }),
      onProgress: counters => seen.push(counters)
    })
    await engine.translate(['one'], 'fr')
    expect(seen.length).toBeGreaterThan(0)
    expect(seen[seen.length - 1]?.translated).toBe(1)
  })
})

describe('TranslationEngine - the glossary bypasses the backend', () => {
  const glossary: Glossary = {
    exact: new Map([['Men-at-Arms', 'Профессионалы']]),
    terms: new Map([['men-at-arms', { source: 'men-at-arms', target: 'Профессионалы' }]]),
    builtFrom: '/game',
    files: 1
  }

  it('uses an official whole-string translation without asking a model', async () => {
    let called = false
    const engine = await engineWith({
      glossary,
      provider: tableProvider({}, () => {
        called = true
      })
    })
    const { results, stats } = await engine.translate(['Men-at-Arms'], 'ru')
    expect(results.get('Men-at-Arms')).toBe('Профессионалы')
    expect(stats.cached).toBe(1)
    expect(called).toBe(false)
  })

  it('hands the model only the terms the batch actually uses', async () => {
    let hints: readonly Hint[] | undefined
    const engine = await engineWith({
      glossary,
      provider: tableProvider({ 'Recruit men-at-arms now': 'x' }, (_texts, h) => {
        hints = h
      })
    })
    await engine.translate(['Recruit men-at-arms now'], 'ru')
    expect(hints).toEqual([{ source: 'men-at-arms', target: 'Профессионалы' }])
  })
})

describe('TranslationEngine - refusals', () => {
  it('refuses a translation that lost a markup token', async () => {
    // Writing it would break the string in game.
    const engine = await engineWith({
      provider: tableProvider({ 'Gain $AMOUNT$': 'Gagne' })
    })
    const { results, stats } = await engine.translate(['Gain $AMOUNT$'], 'fr')
    expect(results.size).toBe(0)
    expect(stats.failed).toBe(1)
    const refusal = engine.refusalFor('fr', 'Gain $AMOUNT$')
    expect(refusal?.reason).toBe('markup')
    expect(refusal?.detail).toContain('lost $AMOUNT$')
  })

  it('refuses an empty answer', async () => {
    const engine = await engineWith({ provider: tableProvider({ one: '   ' }) })
    await engine.translate(['one'], 'fr')
    expect(engine.refusalFor('fr', 'one')?.reason).toBe('empty')
  })

  it('refuses a slot the provider left undefined', async () => {
    const engine = await engineWith({ provider: tableProvider({ one: undefined }) })
    await engine.translate(['one'], 'fr')
    expect(engine.refusalFor('fr', 'one')?.reason).toBe('empty')
  })

  it('refuses an answer carrying a control character (S-3)', async () => {
    // A real newline breaks the `key:0 "..."` line and can inject fake keys into a file the
    // game loads. tokensMatch does not see real newlines, and trim does not remove inner ones.
    const engine = await engineWith({
      provider: tableProvider({ one: 'un\nKEY_EVIL:0 "injected"' })
    })
    await engine.translate(['one'], 'fr')
    const refusal = engine.refusalFor('fr', 'one')
    expect(refusal?.reason).toBe('control')
  })

  it('refuses a tab as well', async () => {
    const engine = await engineWith({ provider: tableProvider({ one: 'un\tdeux' }) })
    await engine.translate(['one'], 'fr')
    expect(engine.refusalFor('fr', 'one')?.reason).toBe('control')
  })

  it('keeps the literal \\n escape, which is legitimate markup', async () => {
    const engine = await engineWith({
      provider: tableProvider({ 'a\\nb': 'x\\ny' })
    })
    const { results } = await engine.translate(['a\\nb'], 'fr')
    expect(results.get('a\\nb')).toBe('x\\ny')
  })

  it('never remembers a refused string', async () => {
    const memory = new TranslationMemory('mem', new MemoryFs())
    const engine = await engineWith({
      memory,
      provider: tableProvider({ 'Gain $AMOUNT$': 'Gagne' })
    })
    await engine.translate(['Gain $AMOUNT$'], 'fr')
    expect(memory.get('fr', 'Gain $AMOUNT$')).toBeUndefined()
  })

  it('clears a refusal once the string finally lands', async () => {
    // The same string can fail for one mod and succeed for the next: keep the last word.
    let attempt = 0
    const provider: Provider = {
      translate: async texts => texts.map(() => (attempt++ === 0 ? 'Gagne' : 'Gagne $AMOUNT$'))
    }
    const engine = await engineWith({ provider })
    await engine.translate(['Gain $AMOUNT$'], 'fr')
    expect(engine.refusalFor('fr', 'Gain $AMOUNT$')).toBeDefined()
    // A second engine call: the memory is empty, so the string is sent again.
    await engine.translate(['Gain $AMOUNT$'], 'fr')
    expect(engine.refusalFor('fr', 'Gain $AMOUNT$')).toBeUndefined()
  })

  it('scopes a refusal to its language', async () => {
    // The original keyed refusals by value alone, so a Russian refusal was readable, and
    // clearable, while translating French on the same engine.
    const engine = await engineWith({ provider: tableProvider({ 'Gain $A$': 'Gagne' }) })
    await engine.translate(['Gain $A$'], 'fr')
    expect(engine.refusalFor('fr', 'Gain $A$')).toBeDefined()
    expect(engine.refusalFor('ru', 'Gain $A$')).toBeUndefined()
  })

  it('lists every refusal with its language', async () => {
    const engine = await engineWith({ provider: tableProvider({ 'Gain $A$': 'Gagne' }) })
    await engine.translate(['Gain $A$'], 'fr')
    await engine.translate(['Gain $A$'], 'ru')
    const { list, dropped } = engine.getRefusals()
    expect(list).toHaveLength(2)
    expect(list.map(r => r.language).toSorted()).toEqual(['fr', 'ru'])
    expect(dropped).toBe(0)
  })
})

describe('TranslationEngine - failure handling', () => {
  it('retries a failed call before giving up', async () => {
    const engine = await engineWith({ retries: 3, provider: flakyProvider(2, { one: 'un' }) })
    const { results } = await engine.translate(['one'], 'fr')
    expect(results.get('one')).toBe('un')
  })

  it('splits a failing batch in half rather than losing it', async () => {
    // A smaller batch often survives a timeout or a truncated answer.
    const table: Record<string, string> = { a: 'A', b: 'B', c: 'C', d: 'D' }
    const provider: Provider = {
      translate: async texts => {
        if (texts.length > 1) throw new Error('too many strings')
        return texts.map(text => table[text])
      }
    }
    const engine = await engineWith({ batchSize: 4, provider })
    const { results } = await engine.translate(['a', 'b', 'c', 'd'], 'fr')
    expect(results.size).toBe(4)
  })

  it('attempts both halves, so the second one is not lost with the first', async () => {
    const provider: Provider = {
      translate: async texts => {
        if (texts.length > 1) throw new Error('batch too big')
        // Only 'b' can be translated one at a time.
        return texts.map(text => (text === 'b' ? 'B' : undefined))
      }
    }
    const engine = await engineWith({ batchSize: 2, provider })
    const { results } = await engine.translate(['a', 'b'], 'fr')
    expect(results.get('b')).toBe('B')
  })

  it('declares the backend down after enough single-string failures', async () => {
    const provider: Provider = {
      translate: async () => {
        throw new Error('connection refused')
      }
    }
    const engine = await engineWith({ batchSize: 1, provider })
    const values = Array.from({ length: BACKEND_DOWN_AFTER + 3 }, (_, i) => `s${i}`)
    await expect(engine.translate(values, 'fr')).rejects.toThrow(/unreachable/)
    expect(engine.isBackendDown()).toBe(true)
  })

  it('stops calling the backend once it is down, even for batches already queued', async () => {
    // The breaker is re-checked after the concurrency queue, so a dead backend does not burn
    // one full timeout per waiting batch.
    let calls = 0
    const provider: Provider = {
      translate: async () => {
        calls++
        throw new Error('connection refused')
      }
    }
    const engine = await engineWith({ batchSize: 1, concurrency: 1, provider })
    const values = Array.from({ length: 20 }, (_, i) => `s${i}`)
    await expect(engine.translate(values, 'fr')).rejects.toThrow()
    expect(calls).toBe(BACKEND_DOWN_AFTER)
  })

  it('makes no call at all on a later run once the backend is down', async () => {
    let calls = 0
    const provider: Provider = {
      translate: async () => {
        calls++
        throw new Error('connection refused')
      }
    }
    const engine = await engineWith({ batchSize: 1, concurrency: 1, provider })
    await expect(
      engine.translate(
        Array.from({ length: BACKEND_DOWN_AFTER }, (_, i) => `s${i}`),
        'fr'
      )
    ).rejects.toThrow()
    const before = calls
    await expect(engine.translate(['later'], 'fr')).rejects.toThrow()
    expect(calls).toBe(before)
    expect(engine.refusalFor('fr', 'later')?.detail).toContain('already declared down')
  })

  it('records why each string was left alone when the backend died', async () => {
    const provider: Provider = {
      translate: async () => {
        throw new Error('connection refused')
      }
    }
    const engine = await engineWith({ batchSize: 1, provider })
    await expect(engine.translate(['one'], 'fr')).rejects.toThrow()
    const refusal = engine.refusalFor('fr', 'one')
    expect(refusal?.reason).toBe('backend')
    expect(refusal?.detail).toContain('connection refused')
  })

  it('keeps the translations it did get when only some batches died', async () => {
    const provider: Provider = {
      translate: async texts => {
        if (texts.includes('bad')) throw new Error('boom')
        return texts.map(() => 'ok')
      }
    }
    const engine = await engineWith({ batchSize: 1, provider })
    const { results } = await engine.translate(['good', 'bad'], 'fr')
    expect(results.get('good')).toBe('ok')
    expect(results.has('bad')).toBe(false)
  })
})

describe('TranslationEngine - cancellation', () => {
  it('translates nothing once the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort()
    const engine = await engineWith({
      signal: controller.signal,
      provider: tableProvider({ one: 'un' })
    })
    const { results } = await engine.translate(['one'], 'fr')
    expect(results.size).toBe(0)
  })
})

describe('TranslationEngine - concurrent mods', () => {
  it('never sends the same string twice when two calls overlap', async () => {
    let calls = 0
    const provider: Provider = {
      translate: async texts => {
        calls++
        await Promise.resolve()
        return texts.map(() => 'un')
      }
    }
    const engine = await engineWith({ provider })
    const [first, second] = await Promise.all([
      engine.translate(['one'], 'fr'),
      engine.translate(['one'], 'fr')
    ])
    expect(calls).toBe(1)
    expect(first.results.get('one')).toBe('un')
    // The second caller waited and then read the memory rather than paying again.
    expect(second.results.get('one')).toBe('un')
  })

  it('reports per-call stats, not a share of the engine total (S-11)', async () => {
    // Two mods on one engine: a before/after delta on the shared counters could come out
    // negative or doubled, which is what the report and the UI showed.
    const provider: Provider = {
      translate: async texts => {
        await Promise.resolve()
        return texts.map(text => `t:${text}`)
      }
    }
    const engine = await engineWith({ provider })
    const [first, second] = await Promise.all([
      engine.translate(['a', 'b'], 'fr'),
      engine.translate(['c', 'd', 'e'], 'fr')
    ])
    expect(first.stats.translated).toBe(2)
    expect(second.stats.translated).toBe(3)
    expect(engine.getCounters().translated).toBe(5)
  })

  it('keeps the engine-wide counters cumulative across calls', async () => {
    const engine = await engineWith({ provider: tableProvider({ a: 'A', b: 'B' }) })
    await engine.translate(['a'], 'fr')
    await engine.translate(['b'], 'fr')
    expect(engine.getCounters().translated).toBe(2)
  })

  it('honours the concurrency limit', async () => {
    let running = 0
    let peak = 0
    const provider: Provider = {
      translate: async texts => {
        running++
        peak = Math.max(peak, running)
        await Promise.resolve()
        running--
        return texts.map(() => 'x')
      }
    }
    const engine = await engineWith({ batchSize: 1, concurrency: 2, provider })
    await engine.translate(['a', 'b', 'c', 'd', 'e', 'f'], 'fr')
    expect(peak).toBeLessThanOrEqual(2)
  })
})

describe('describeTokenLoss', () => {
  it('names a lost token', () => {
    expect(describeTokenLoss('a $X$ b', 'a b')).toBe('lost $X$')
  })

  it('names an invented token', () => {
    expect(describeTokenLoss('a b', 'a $X$ b')).toBe('added $X$')
  })

  it('names both at once', () => {
    expect(describeTokenLoss('a $X$', 'a $Y$')).toBe('lost $X$, added $Y$')
  })

  it('falls back to the counts when the same token was duplicated', () => {
    expect(describeTokenLoss('a $X$', 'a $X$ $X$')).toBe('token count 1 became 2')
  })
})
