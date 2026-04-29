import { describe, expect, it } from 'vitest'

import { parse } from '../src/parser.js'
import { serialize } from '../src/serializer.js'
import type { LocaleFile } from '../src/types.js'

const BOM = '﻿'

describe('serialize - basic', () => {
  it('emits the language header', () => {
    const file: LocaleFile = {
      language: 'french',
      entries: [],
      trailingComments: [],
      bom: false
    }
    expect(serialize(file)).toBe('l_french:\n')
  })

  it('emits an entry with version', () => {
    const file: LocaleFile = {
      language: 'english',
      entries: [{ key: 'KEY', version: 0, value: 'value', rawLine: 2 }],
      trailingComments: [],
      bom: false
    }
    const out = serialize(file)
    expect(out).toContain(' KEY:0 "value"')
  })

  it('emits an entry without version (null)', () => {
    const file: LocaleFile = {
      language: 'english',
      entries: [{ key: 'KEY', version: null, value: 'value', rawLine: 2 }],
      trailingComments: [],
      bom: false
    }
    const out = serialize(file)
    expect(out).toContain(' KEY: "value"')
  })

  it('preserves inline comments', () => {
    const file: LocaleFile = {
      language: 'english',
      entries: [{ key: 'KEY', version: 0, value: 'v', comment: '# note', rawLine: 2 }],
      trailingComments: [],
      bom: false
    }
    expect(serialize(file)).toContain(' KEY:0 "v" # note')
  })

  it('emits trailing comments', () => {
    const file: LocaleFile = {
      language: 'english',
      entries: [],
      trailingComments: ['# trailing'],
      bom: false
    }
    expect(serialize(file)).toContain('# trailing')
  })
})

describe('serialize - BOM', () => {
  it('emits BOM when file.bom is true', () => {
    const file: LocaleFile = {
      language: 'english',
      entries: [],
      trailingComments: [],
      bom: true
    }
    expect(serialize(file).startsWith(BOM)).toBe(true)
  })

  it('skips BOM when file.bom is false', () => {
    const file: LocaleFile = {
      language: 'english',
      entries: [],
      trailingComments: [],
      bom: false
    }
    expect(serialize(file).startsWith(BOM)).toBe(false)
  })

  it('opts.bom overrides file.bom', () => {
    const file: LocaleFile = {
      language: 'english',
      entries: [],
      trailingComments: [],
      bom: false
    }
    expect(serialize(file, { bom: true }).startsWith(BOM)).toBe(true)
    const fileWithBom: LocaleFile = { ...file, bom: true }
    expect(serialize(fileWithBom, { bom: false }).startsWith(BOM)).toBe(false)
  })
})

describe('serialize - line endings', () => {
  it('uses LF by default', () => {
    const file: LocaleFile = {
      language: 'english',
      entries: [{ key: 'KEY', version: 0, value: 'value', rawLine: 2 }],
      trailingComments: [],
      bom: false
    }
    const out = serialize(file)
    expect(out).not.toContain('\r')
  })

  it('uses CRLF when requested', () => {
    const file: LocaleFile = {
      language: 'english',
      entries: [{ key: 'KEY', version: 0, value: 'value', rawLine: 2 }],
      trailingComments: [],
      bom: false
    }
    const out = serialize(file, { lineEnding: '\r\n' })
    expect(out).toContain('\r\n')
  })
})

describe('round-trip parse → serialize → parse', () => {
  const samples: Array<[string, string]> = [
    ['simple', `${BOM}l_english:\n KEY:0 "value"\n`],
    ['multiple entries', `${BOM}l_french:\n KEY1:0 "value1"\n KEY2:0 "value2"\n KEY3:0 "value3"\n`],
    ['no version', `${BOM}l_english:\n KEY: "value"\n`],
    ['high version number', `${BOM}l_english:\n KEY:42 "value"\n`],
    ['escaped quotes', `${BOM}l_english:\n KEY:0 "she said \\"hi\\""\n`],
    ['color codes', `${BOM}l_english:\n KEY:0 "§Yyellow§! and £gold£"\n`],
    ['hash inside value', `${BOM}l_english:\n KEY:0 "hashtag # inside"\n`],
    ['empty value', `${BOM}l_english:\n KEY:0 ""\n`],
    ['inline comment', `${BOM}l_english:\n KEY:0 "value" # inline note\n`],
    ['simp_chinese language', `${BOM}l_simp_chinese:\n KEY:0 "你好"\n`],
    [
      'mixed keys',
      `${BOM}l_english:\n KEY_ONE:0 "a"\n KEY.two:0 "b"\n KEY-three:0 "c"\n KEY4:0 "d"\n`
    ]
  ]

  for (const [name, input] of samples) {
    it(`preserves "${name}"`, () => {
      const first = parse(input)
      expect(first.ok).toBe(true)
      const reSerialized = serialize(first.file)
      const second = parse(reSerialized)
      expect(second.ok).toBe(true)
      expect(second.file).toEqual(first.file)
    })
  }
})

describe('round-trip - line endings preservation', () => {
  it('CRLF survives parse → serialize', () => {
    const source = `${BOM}l_english:\r\n KEY:0 "v"\r\n`
    const reSerialized = serialize(parse(source).file)
    expect(reSerialized).toBe(source)
  })

  it('LF survives parse → serialize', () => {
    const source = `${BOM}l_english:\n KEY:0 "v"\n`
    const reSerialized = serialize(parse(source).file)
    expect(reSerialized).toBe(source)
  })

  it('opts.lineEnding overrides file.lineEnding', () => {
    const file = parse(`l_english:\r\n KEY:0 "v"\r\n`).file
    const out = serialize(file, { lineEnding: '\n' })
    expect(out).not.toContain('\r')
  })
})

describe('round-trip - interleaved comments preservation', () => {
  it('keeps a leading comment before entries', () => {
    const source = `l_english:\n# leading\n KEY:0 "v"\n`
    const out = serialize(parse(source).file)
    expect(out).toBe(source)
  })

  it('keeps comments between entries in order', () => {
    const source = `l_english:\n KEY1:0 "a"\n# mid\n KEY2:0 "b"\n# end\n`
    const out = serialize(parse(source).file)
    expect(out).toBe(source)
  })

  it('re-emits blank lines in original positions', () => {
    const source = `l_english:\n KEY1:0 "a"\n\n KEY2:0 "b"\n`
    const out = serialize(parse(source).file)
    expect(out).toBe(source)
  })
})

describe('round-trip - multi-line values', () => {
  it('preserves a 2-line value through parse → serialize → parse', () => {
    const source = `l_english:\n KEY:0 "first\nsecond"\n`
    const first = parse(source)
    expect(first.ok).toBe(true)
    const reSerialized = serialize(first.file)
    expect(reSerialized).toBe(source)
  })

  it('preserves a CRLF multi-line value', () => {
    const source = `l_english:\r\n KEY:0 "first\r\nsecond"\r\n`
    const first = parse(source)
    expect(first.ok).toBe(true)
    const reSerialized = serialize(first.file)
    expect(reSerialized).toBe(source)
  })
})

describe('round-trip - fuzz on random inputs', () => {
  it('preserves AST under repeated parse/serialize cycles', () => {
    const samples = [
      `${BOM}l_english:\n A:0 "a"\n B:1 "b"\n`,
      `${BOM}l_french:\n KEY:0 "valeur avec accents éàç"\n`,
      `${BOM}l_english:\n EMPTY:0 ""\n FILLED:0 "x"\n`
    ]
    for (const input of samples) {
      let current = parse(input).file
      for (let i = 0; i < 5; i++) {
        const reparsed = parse(serialize(current))
        expect(reparsed.ok).toBe(true)
        expect(reparsed.file).toEqual(current)
        current = reparsed.file
      }
    }
  })
})
