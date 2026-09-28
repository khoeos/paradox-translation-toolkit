import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { clip, num, ticker, visibleLength } from './output.js'

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

describe('ticker', () => {
  const tty = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY')

  const drawn = (write: { mock: { calls: unknown[][] } }): string[] =>
    write.mock.calls.map(([chunk]) => String(chunk).replace(`\r${ESC}[2K`, ''))

  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    if (tty) Object.defineProperty(process.stderr, 'isTTY', tty)
    else Reflect.deleteProperty(process.stderr, 'isTTY')
  })

  it('draws the last text of a burst once the interval is over, not only the first', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const tick = ticker()
    tick.show('one')
    tick.show('two')
    tick.show('three')
    expect(drawn(write)).toEqual(['one'])

    vi.advanceTimersByTime(100)
    expect(drawn(write)).toEqual(['one', 'three'])
  })

  it('draws nothing more once stopped', () => {
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    const tick = ticker()
    tick.show('one')
    tick.show('two')
    tick.stop()

    vi.advanceTimersByTime(1000)
    expect(drawn(write)).toEqual(['one'])
  })
})
