import { describe, expect, it } from 'vitest'

import { buildTargetContent, planMod } from '../src/index.js'
import type { CreationJob } from '../src/index.js'
import { localeFile, stellarisDef } from './fixtures.js'
import { MemoryFs } from './memory-fs.js'

const job = (over: Partial<CreationJob> = {}): CreationJob => ({
  source: 'mod/localisation/a_l_english.yml',
  target: 'mod/localisation/a_l_russian.yml',
  packed: [],
  keys: new Map(),
  known: new Map(),
  content: 'missing-keys',
  ...over
})

describe('buildTargetContent', () => {
  it('retags the header to the target language', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': localeFile('english', [['K', 'text']])
    })
    const content = await buildTargetContent(
      { job: job({ keys: new Map([['K', 'text']]) }), targetToken: 'russian' },
      fs
    )
    expect(content).toContain('l_russian:')
    expect(content).not.toContain('l_english:')
  })

  it('keeps a key holding the source language in its name (S-1)', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': localeFile('english', [
        ['special_l_english_name', 'text'],
        ['NORMAL', 'other']
      ])
    })
    const content = await buildTargetContent(
      {
        job: job({
          keys: new Map([
            ['special_l_english_name', 'text'],
            ['NORMAL', 'other']
          ])
        }),
        targetToken: 'russian'
      },
      fs
    )
    expect(content).toContain('special_l_english_name:')
    expect(content).toContain('NORMAL:')
  })

  it('writes only the keys the job asks for, under missing-keys', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': localeFile('english', [
        ['MINE', 'a'],
        ['THEIRS', 'b']
      ])
    })
    const content = await buildTargetContent(
      { job: job({ keys: new Map([['MINE', 'a']]) }), targetToken: 'russian' },
      fs
    )
    expect(content).toContain('MINE:')
    expect(content).not.toContain('THEIRS:')
  })

  it('substitutes the translations it was handed', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': localeFile('english', [['K', 'Colony Ship']])
    })
    const content = await buildTargetContent(
      {
        job: job({ keys: new Map([['K', 'Colony Ship']]) }),
        targetToken: 'russian',
        translations: new Map([['Colony Ship', 'Корабль-колония']])
      },
      fs
    )
    expect(content).toContain('"Корабль-колония"')
  })

  it('keeps what an earlier run translated over a fresh translation', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': localeFile('english', [['K', 'Colony Ship']])
    })
    const content = await buildTargetContent(
      {
        job: job({
          keys: new Map([['K', 'Colony Ship']]),
          known: new Map([['K', 'Старый перевод']])
        }),
        targetToken: 'russian',
        translations: new Map([['Colony Ship', 'Новый перевод']])
      },
      fs
    )
    expect(content).toContain('"Старый перевод"')
    expect(content).not.toContain('Новый перевод')
  })

  it('leaves a value untranslated when nothing came back for it', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': localeFile('english', [['K', 'Colony Ship']])
    })
    const content = await buildTargetContent(
      { job: job({ keys: new Map([['K', 'Colony Ship']]) }), targetToken: 'russian' },
      fs
    )
    expect(content).toContain('"Colony Ship"')
  })

  it('escapes a quote a translator introduced', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': localeFile('english', [['K', 'he said yes']])
    })
    const content = await buildTargetContent(
      {
        job: job({ keys: new Map([['K', 'he said yes']]) }),
        targetToken: 'french',
        translations: new Map([['he said yes', 'il a dit "oui"']])
      },
      fs
    )
    expect(content).toContain('\\"oui\\"')
  })

  it('keeps the version number of each entry', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': `﻿l_english:\n K:3 "text"\n`
    })
    const content = await buildTargetContent(
      { job: job({ keys: new Map([['K', 'text']]) }), targetToken: 'russian' },
      fs
    )
    expect(content).toContain('K:3 ')
  })

  it('keeps the BOM, which the games require', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': localeFile('english', [['K', 'text']])
    })
    const content = await buildTargetContent(
      { job: job({ keys: new Map([['K', 'text']]) }), targetToken: 'russian' },
      fs
    )
    expect(content.startsWith('﻿')).toBe(true)
  })

  it('drops the comments of the source file, under missing-keys', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': `﻿l_english:\n # a note\n K:0 "text"\n`
    })
    const content = await buildTargetContent(
      { job: job({ keys: new Map([['K', 'text']]) }), targetToken: 'russian' },
      fs
    )
    expect(content).not.toContain('a note')
  })

  it('throws on an unparsable source rather than writing rubbish', async () => {
    const fs = new MemoryFs({ 'mod/localisation/a_l_english.yml': 'not a locale file at all' })
    await expect(buildTargetContent({ job: job(), targetToken: 'russian' }, fs)).rejects.toThrow(
      /Parse failed/
    )
  })

  it('produces a file the parser reads back', async () => {
    const fs = new MemoryFs({
      'mod/localisation/english/a_l_english.yml': localeFile('english', [
        ['K1', 'one'],
        ['K2', 'two']
      ])
    })
    const plan = await planMod(
      { id: 'mod', path: 'mod' },
      {
        gameDef: stellarisDef,
        sourceLanguage: 'en',
        targetLanguages: ['ru'],
        packed: false
      },
      fs
    )
    const planned = plan.jobs.ru?.[0]
    const content = await buildTargetContent({ job: planned!, targetToken: 'russian' }, fs)
    fs.seedFile('out_l_russian.yml', content)
    const { parse } = await import('@ptt/parser')
    const reparsed = parse(content)
    expect(reparsed.ok).toBe(true)
    expect(reparsed.file.language).toBe('russian')
    expect(reparsed.file.entries.map(e => e.key).toSorted()).toEqual(['K1', 'K2'])
  })
})

describe('buildTargetContent - whole file', () => {
  const wholeFile = (over: Partial<CreationJob> = {}): CreationJob =>
    job({ content: 'complete-file', ...over })

  it('writes every key the source declares', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': localeFile('english', [
        ['K1', 'one'],
        ['K2', 'two'],
        ['K3', 'three']
      ])
    })
    const content = await buildTargetContent(
      {
        job: wholeFile({
          keys: new Map([
            ['K1', 'one'],
            ['K2', 'two'],
            ['K3', 'three']
          ])
        }),
        targetToken: 'russian'
      },
      fs
    )
    for (const key of ['K1:', 'K2:', 'K3:']) expect(content).toContain(key)
  })

  it('keeps the comments and the blank lines of the source, in source order', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml':
        '﻿l_english:\n# head note\n K1:0 "one"\n\n# second note\n K2:0 "two"\n'
    })
    const content = await buildTargetContent(
      {
        job: wholeFile({
          keys: new Map([
            ['K1', 'one'],
            ['K2', 'two']
          ])
        }),
        targetToken: 'russian'
      },
      fs
    )
    expect(content.replace('﻿', '').split('\n').slice(0, 6)).toEqual([
      'l_russian:',
      '# head note',
      ' K1:0 "one"',
      '',
      '# second note',
      ' K2:0 "two"'
    ])
  })

  it('substitutes a translated value while keeping the comment above it', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': '﻿l_english:\n# a note\n K:0 "Colony Ship"\n'
    })
    const content = await buildTargetContent(
      {
        job: wholeFile({ keys: new Map([['K', 'Colony Ship']]) }),
        targetToken: 'russian',
        translations: new Map([['Colony Ship', 'Корабль-колония']])
      },
      fs
    )
    expect(content).toContain('# a note')
    expect(content).toContain('"Корабль-колония"')
    expect(content).not.toContain('Colony Ship')
  })

  it('keeps the value the replaced file held over a fresh translation', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': localeFile('english', [['K', 'Colony Ship']])
    })
    const content = await buildTargetContent(
      {
        job: wholeFile({
          keys: new Map([['K', 'Colony Ship']]),
          known: new Map([['K', 'Корабль-колония']])
        }),
        targetToken: 'russian',
        translations: new Map([['Colony Ship', 'Новый перевод']])
      },
      fs
    )
    expect(content).toContain('"Корабль-колония"')
    expect(content).not.toContain('Новый перевод')
  })

  it('keeps the BOM, the CRLF line endings and the entry version numbers', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': '﻿l_english:\r\n K:3 "text"\r\n'
    })
    const content = await buildTargetContent(
      { job: wholeFile({ keys: new Map([['K', 'text']]) }), targetToken: 'russian' },
      fs
    )
    expect(content.startsWith('﻿')).toBe(true)
    expect(content).toContain('\r\n')
    expect(content).toContain('K:3 ')
  })

  it('keeps a key holding the source language in its name (S-1)', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': localeFile('english', [
        ['special_l_english_name', 'text'],
        ['NORMAL', 'other']
      ])
    })
    const content = await buildTargetContent(
      {
        job: wholeFile({
          keys: new Map([
            ['special_l_english_name', 'text'],
            ['NORMAL', 'other']
          ])
        }),
        targetToken: 'russian'
      },
      fs
    )
    expect(content).toContain('special_l_english_name:')
    expect(content).toContain('NORMAL:')
    expect(content).not.toContain('l_english:')
  })

  it('throws on an unparsable source rather than writing rubbish', async () => {
    const fs = new MemoryFs({ 'mod/localisation/a_l_english.yml': 'not a locale file at all' })
    await expect(
      buildTargetContent({ job: wholeFile(), targetToken: 'russian' }, fs)
    ).rejects.toThrow(/Parse failed/)
  })

  it('refuses a source file too large to be a localisation file', async () => {
    const fs = new MemoryFs({
      'mod/localisation/a_l_english.yml': localeFile('english', [['K', 'text']])
    })
    const realStat = fs.stat.bind(fs)
    fs.stat = async path =>
      path.endsWith('a_l_english.yml')
        ? { isDirectory: false, isFile: true, size: 60 * 1024 * 1024 }
        : realStat(path)

    await expect(
      buildTargetContent(
        { job: wholeFile({ keys: new Map([['K', 'text']]) }), targetToken: 'russian' },
        fs
      )
    ).rejects.toThrow(/exceeds/)
  })
})
