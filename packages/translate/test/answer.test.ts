import { describe, expect, it } from 'vitest'

import { parseAnswer } from '../src/index.js'

describe('parseAnswer - shapes', () => {
  it('reads an index-keyed translations object', () => {
    const parsed = parseAnswer('{"translations":{"0":"un","1":"deux"}}', 2)
    expect(parsed.slots).toEqual(['un', 'deux'])
    expect(parsed.keyed).toBe(true)
  })

  it('reads a bare array positionally', () => {
    const parsed = parseAnswer('{"translations":["un","deux"]}', 2)
    expect(parsed.slots).toEqual(['un', 'deux'])
    expect(parsed.keyed).toBe(false)
  })

  it('reads a top-level array', () => {
    expect(parseAnswer('["un","deux"]', 2).slots).toEqual(['un', 'deux'])
  })

  it('reads a renamed field', () => {
    expect(parseAnswer('{"result":{"0":"un"}}', 1).slots).toEqual(['un'])
  })

  it('digs the JSON out of surrounding prose', () => {
    const content = 'Sure! Here you go:\n```json\n{"translations":{"0":"un"}}\n```'
    expect(parseAnswer(content, 1).slots).toEqual(['un'])
  })

  it('throws when there is no JSON at all', () => {
    expect(() => parseAnswer('I cannot do that', 1)).toThrow(/did not answer with JSON/)
  })

  it('throws when the JSON holds no collection', () => {
    expect(() => parseAnswer('{"translations":"un"}', 1)).toThrow(/no translation collection/)
  })

  it('throws when a scalar is returned', () => {
    expect(() => parseAnswer('42', 1)).toThrow(/no translation collection/)
  })
})

describe('parseAnswer - reordering (S-4)', () => {
  it('places a keyed answer by its index, not by its position', () => {
    const parsed = parseAnswer('{"translations":{"1":"deux","0":"un"}}', 2)
    expect(parsed.slots).toEqual(['un', 'deux'])
  })

  it('leaves a missing index undefined rather than shifting the rest up', () => {
    const parsed = parseAnswer('{"translations":{"0":"un","2":"trois"}}', 3)
    expect(parsed.slots).toEqual(['un', undefined, 'trois'])
  })

  it('ignores an index beyond what was asked for', () => {
    const parsed = parseAnswer('{"translations":{"0":"un","9":"neuf"}}', 1)
    expect(parsed.slots).toEqual(['un'])
  })

  it('still requires an exact length from a positional array', () => {
    expect(() => parseAnswer('{"translations":["un"]}', 2)).toThrow(/1 strings instead of 2/)
  })
})

describe('parseAnswer - non-strings (S-5)', () => {
  const cases: Array<[label: string, json: string]> = [
    ['null', '{"translations":{"0":null}}'],
    ['a number', '{"translations":{"0":123}}'],
    ['an object', '{"translations":{"0":{"text":"un"}}}'],
    ['a boolean', '{"translations":{"0":false}}'],
    ['a nested array', '{"translations":{"0":["un"]}}']
  ]

  for (const [label, json] of cases) {
    it(`refuses ${label} instead of coercing it`, () => {
      expect(parseAnswer(json, 1).slots).toEqual([undefined])
    })
  }

  it('keeps the good slots of a partly broken answer', () => {
    const parsed = parseAnswer('{"translations":{"0":"un","1":null,"2":"trois"}}', 3)
    expect(parsed.slots).toEqual(['un', undefined, 'trois'])
  })

  it('accepts an empty string, which the engine refuses as empty later', () => {
    expect(parseAnswer('{"translations":{"0":""}}', 1).slots).toEqual([''])
  })
})
