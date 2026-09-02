import { describe, expect, it } from 'vitest'

import { asBool, asList, asNumber, asString } from './coerce.js'

describe('asString', () => {
  it('passes a string through', () => {
    expect(asString('ollama')).toBe('ollama')
  })

  it('renders a number, because a number in the config file is still a value', () => {
    expect(asString(150)).toBe('150')
  })

  it('ignores a boolean', () => {
    expect(asString(true)).toBeUndefined()
  })

  it('ignores undefined', () => {
    expect(asString(undefined)).toBeUndefined()
  })
})

describe('asNumber', () => {
  it('reads a numeric string', () => {
    expect(asNumber('150', 20)).toBe(150)
  })

  it('reads a number from the config file', () => {
    expect(asNumber(150, 20)).toBe(150)
  })

  it('falls back on a non-numeric value', () => {
    expect(asNumber('lots', 20)).toBe(20)
  })

  it('falls back on zero and on negatives, which no setting accepts', () => {
    expect(asNumber('0', 20)).toBe(20)
    expect(asNumber('-5', 20)).toBe(20)
  })

  it('falls back on undefined', () => {
    expect(asNumber(undefined, 20)).toBe(20)
  })
})

describe('asBool', () => {
  it('reads a bare switch', () => {
    expect(asBool(true)).toBe(true)
  })

  it('reads the words that mean no', () => {
    expect(asBool('false')).toBe(false)
    expect(asBool('0')).toBe(false)
    expect(asBool('no')).toBe(false)
    expect(asBool('NO')).toBe(false)
  })

  it('reads anything else as yes', () => {
    expect(asBool('yes')).toBe(true)
    expect(asBool('1')).toBe(true)
  })

  it('reads a number from the config file', () => {
    expect(asBool(1)).toBe(true)
    expect(asBool(0)).toBe(false)
  })

  it('uses the fallback when absent', () => {
    expect(asBool(undefined)).toBe(false)
    expect(asBool(undefined, true)).toBe(true)
  })
})

describe('asList', () => {
  it('splits on commas and trims', () => {
    expect(asList('a, b ,c')).toEqual(['a', 'b', 'c'])
  })

  it('drops empty items', () => {
    expect(asList('a,,b,')).toEqual(['a', 'b'])
  })

  it('returns undefined for an empty value rather than an empty list', () => {
    expect(asList('')).toBeUndefined()
    expect(asList(' , ')).toBeUndefined()
    expect(asList(undefined)).toBeUndefined()
  })
})
