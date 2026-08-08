import { describe, expect, it } from 'vitest'

import { MemoryFs } from '@ptt/converter-core/test/memory-fs'

import { FLUSH_EVERY, TranslationMemory } from '../src/index.js'

describe('TranslationMemory - reading', () => {
  it('starts empty when no file exists yet', async () => {
    const memory = new TranslationMemory('mem', new MemoryFs())
    await memory.load('ru')
    expect(memory.get('ru', 'Colony Ship')).toBeUndefined()
  })

  it('reads a translation written by an earlier run', async () => {
    const fs = new MemoryFs({ 'mem/ru.json': '{"Colony Ship":"Корабль-колония"}' })
    const memory = new TranslationMemory('mem', fs)
    await memory.load('ru')
    expect(memory.get('ru', 'Colony Ship')).toBe('Корабль-колония')
  })

  it('keeps languages apart', async () => {
    const fs = new MemoryFs({
      'mem/ru.json': '{"one":"один"}',
      'mem/fr.json': '{"one":"un"}'
    })
    const memory = new TranslationMemory('mem', fs)
    await memory.load('ru')
    await memory.load('fr')
    expect(memory.get('ru', 'one')).toBe('один')
    expect(memory.get('fr', 'one')).toBe('un')
  })

  it('loads a language only once', async () => {
    const fs = new MemoryFs({ 'mem/ru.json': '{"one":"один"}' })
    const memory = new TranslationMemory('mem', fs)
    await memory.load('ru')
    await memory.set('ru', 'two', 'два')
    // A second load must not wipe what the run has produced since.
    await memory.load('ru')
    expect(memory.get('ru', 'two')).toBe('два')
  })

  it('starts empty on a truncated file rather than throwing', async () => {
    // What a killed run used to leave behind before the write became atomic.
    const fs = new MemoryFs({ 'mem/ru.json': '{"Colony Ship":"Кораб' })
    const memory = new TranslationMemory('mem', fs)
    await memory.load('ru')
    expect(memory.get('ru', 'Colony Ship')).toBeUndefined()
  })

  it('ignores non-string values in the file', async () => {
    const fs = new MemoryFs({ 'mem/ru.json': '{"a":"один","b":42,"c":null}' })
    const memory = new TranslationMemory('mem', fs)
    await memory.load('ru')
    expect(memory.get('ru', 'a')).toBe('один')
    expect(memory.get('ru', 'b')).toBeUndefined()
  })

  it('ignores a file holding an array instead of an object', async () => {
    const fs = new MemoryFs({ 'mem/ru.json': '["один"]' })
    const memory = new TranslationMemory('mem', fs)
    await memory.load('ru')
    expect(memory.isLoaded('ru')).toBe(true)
  })

  it('names its file after the language', () => {
    const memory = new TranslationMemory('mem', new MemoryFs())
    expect(memory.file('zh-Hans')).toBe('mem/zh-Hans.json')
  })
})

describe('TranslationMemory - writing', () => {
  it('refuses a write for a language that was never loaded', async () => {
    // The original dropped it in silence, so a whole run could remember nothing.
    const memory = new TranslationMemory('mem', new MemoryFs())
    await expect(memory.set('ru', 'one', 'один')).rejects.toThrow(/never loaded/)
  })

  it('writes through a temporary file and renames it (S-8, S-19)', async () => {
    // An in-place rewrite killed halfway left a truncated JSON that load() swallowed, losing
    // the whole language. A rename is atomic, so the file is either the old one or the new one.
    const fs = new MemoryFs()
    const memory = new TranslationMemory('mem', fs)
    await memory.load('ru')
    await memory.set('ru', 'one', 'один')
    await memory.flush()

    const files = [...fs.snapshot().keys()]
    expect(files).toEqual(['mem/ru.json'])
    expect(JSON.parse(fs.snapshot().get('mem/ru.json') ?? '')).toEqual({ one: 'один' })
  })

  it('flushes nothing when nothing changed', async () => {
    const fs = new MemoryFs()
    const memory = new TranslationMemory('mem', fs)
    await memory.load('ru')
    await memory.flush()
    expect(fs.snapshot().size).toBe(0)
  })

  it('flushes on its own once enough translations piled up', async () => {
    const fs = new MemoryFs()
    const memory = new TranslationMemory('mem', fs)
    await memory.load('ru')
    for (let i = 0; i < FLUSH_EVERY; i++) await memory.set('ru', `k${i}`, `v${i}`)
    // No explicit flush: the counter reached the threshold.
    expect(fs.snapshot().has('mem/ru.json')).toBe(true)
  })

  it('does not flush before the threshold, so the caller must flush at the end', async () => {
    const fs = new MemoryFs()
    const memory = new TranslationMemory('mem', fs)
    await memory.load('ru')
    await memory.set('ru', 'one', 'один')
    expect(fs.snapshot().has('mem/ru.json')).toBe(false)
  })

  it('writes every changed language in one flush', async () => {
    const fs = new MemoryFs()
    const memory = new TranslationMemory('mem', fs)
    await memory.load('ru')
    await memory.load('fr')
    await memory.set('ru', 'one', 'один')
    await memory.set('fr', 'one', 'un')
    await memory.flush()
    expect([...fs.snapshot().keys()].toSorted()).toEqual(['mem/fr.json', 'mem/ru.json'])
  })

  it('round-trips through a reload', async () => {
    const fs = new MemoryFs()
    const first = new TranslationMemory('mem', fs)
    await first.load('ru')
    await first.set('ru', 'Colony Ship', 'Корабль-колония')
    await first.flush()

    const second = new TranslationMemory('mem', fs)
    await second.load('ru')
    expect(second.get('ru', 'Colony Ship')).toBe('Корабль-колония')
  })
})

describe('TranslationMemory - clearing', () => {
  it('clears one language and leaves the others', async () => {
    const fs = new MemoryFs({
      'mem/ru.json': '{"one":"один"}',
      'mem/fr.json': '{"one":"un"}'
    })
    const memory = new TranslationMemory('mem', fs)
    await memory.load('ru')
    await memory.load('fr')
    await memory.clear('ru')
    expect(fs.snapshot().has('mem/ru.json')).toBe(false)
    expect(fs.snapshot().has('mem/fr.json')).toBe(true)
    expect(memory.get('ru', 'one')).toBeUndefined()
  })

  it('clears every memory file, even for languages this instance never loaded', async () => {
    const fs = new MemoryFs({
      'mem/ru.json': '{"one":"один"}',
      'mem/fr.json': '{"one":"un"}',
      'mem/de.json.tmp': '{}'
    })
    const memory = new TranslationMemory('mem', fs)
    await memory.clear()
    expect(fs.snapshot().size).toBe(0)
  })

  it('leaves anything that is not a memory file alone', async () => {
    const fs = new MemoryFs({ 'mem/ru.json': '{}', 'mem/notes.txt': 'keep me' })
    const memory = new TranslationMemory('mem', fs)
    await memory.clear()
    expect(fs.snapshot().has('mem/notes.txt')).toBe(true)
  })

  it('does nothing when there is no directory', async () => {
    const memory = new TranslationMemory('mem', new MemoryFs())
    await expect(memory.clear()).resolves.toBeUndefined()
  })
})
