import { describe, expect, it } from 'vitest'

import { MemoryFs } from '@ptt/converter/test/memory-fs'

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
    await memory.load('ru')
    expect(memory.get('ru', 'two')).toBe('два')
  })

  it('starts empty on a truncated file rather than throwing', async () => {
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

  it('keeps the historical file name of a built-in code, case included', () => {
    const memory = new TranslationMemory('mem', new MemoryFs())
    expect(memory.file('pt-BR')).toBe('mem/pt-BR.json')
  })

  it('folds a free-text label, so one label is one file on every platform', () => {
    const memory = new TranslationMemory('mem', new MemoryFs())
    expect(memory.file('Catalan')).toBe('mem/catalan.json')
    expect(memory.file('catalan')).toBe(memory.file('Catalan'))
  })

  it('keeps two labels the safe-name rule would flatten onto two files', () => {
    const memory = new TranslationMemory('mem', new MemoryFs())
    expect(memory.file('Українська')).not.toBe(memory.file('Македонски'))
    expect(memory.file('my lang')).not.toBe(memory.file('my_lang'))
    expect(memory.file('Català')).not.toBe(memory.file('Catalã'))
  })

  it('names a folded label deterministically', () => {
    const memory = new TranslationMemory('mem', new MemoryFs())
    expect(memory.file('my lang')).toBe(memory.file('MY LANG'))
    expect(memory.file('my_lang')).toBe('mem/my_lang.json')
  })

  it('writes one file per language when two labels fold to the same safe name', async () => {
    const fs = new MemoryFs()
    const memory = new TranslationMemory('mem', fs)
    await memory.load('Українська')
    await memory.load('Македонски')
    await memory.set('Українська', 'Colony Ship', 'Колонізаційний корабель')
    await memory.set('Македонски', 'Colony Ship', 'Колонизациски брод')
    await memory.flush()

    const written = [...fs.snapshot().keys()].filter(path => path.endsWith('.json'))
    expect(written).toHaveLength(2)

    const reread = new TranslationMemory('mem', fs)
    await reread.load('Українська')
    await reread.load('Македонски')
    expect(reread.get('Українська', 'Colony Ship')).toBe('Колонізаційний корабель')
    expect(reread.get('Македонски', 'Colony Ship')).toBe('Колонизациски брод')
  })

  it('round-trips a translation stored under a free-text label', async () => {
    const fs = new MemoryFs()
    const first = new TranslationMemory('mem', fs)
    await first.load('Catalan')
    await first.set('Catalan', 'Colony Ship', 'Nau colonial')
    await first.flush()

    const second = new TranslationMemory('mem', fs)
    await second.load('Catalan')
    expect(second.get('Catalan', 'Colony Ship')).toBe('Nau colonial')
    expect(fs.snapshot().has('mem/catalan.json')).toBe(true)
  })
})

describe('TranslationMemory - writing', () => {
  it('refuses a write for a language that was never loaded', async () => {
    const memory = new TranslationMemory('mem', new MemoryFs())
    await expect(memory.set('ru', 'one', 'один')).rejects.toThrow(/never loaded/)
  })

  it('writes through a temporary file and renames it (S-8, S-19)', async () => {
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
