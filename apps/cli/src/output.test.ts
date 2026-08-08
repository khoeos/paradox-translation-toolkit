import { describe, expect, it } from 'vitest'

import { clip, num, visibleLength } from './output.js'

const ESC = '\u001b'

describe('num', () => {
  it('groups thousands so a six-digit count reads at a glance', () => {
    expect(num(1234567)).toBe('1 234 567')
  })

  it('leaves a small number alone', () => {
    expect(num(42)).toBe('42')
  })

  it('handles zero', () => {
    expect(num(0)).toBe('0')
  })
})

describe('clip', () => {
  it('leaves a short value alone', () => {
    expect(clip('short', 10)).toBe('short')
  })

  it('keeps the start, which is the part that identifies a mod', () => {
    expect(clip('Muslim Enchantments', 10)).toBe('Muslim En…')
  })

  it('never returns an empty string for a width of one', () => {
    expect(clip('abc', 1)).toBe('a…')
  })

  it('keeps a value of exactly the width', () => {
    expect(clip('abcde', 5)).toBe('abcde')
  })
})

describe('visibleLength', () => {
  it('ignores colour codes, which take width in the string but none on screen', () => {
    // Column widths are computed from this, so a coloured cell would be padded wrong.
    const coloured = `${ESC}[32mok${ESC}[0m`
    expect(coloured.length).toBeGreaterThan(2)
    expect(visibleLength(coloured)).toBe(2)
  })

  it('counts a plain string normally', () => {
    expect(visibleLength('hello')).toBe(5)
  })

  it('handles several codes in one cell', () => {
    expect(visibleLength(`${ESC}[1m${ESC}[32mok${ESC}[0m`)).toBe(2)
  })
})
