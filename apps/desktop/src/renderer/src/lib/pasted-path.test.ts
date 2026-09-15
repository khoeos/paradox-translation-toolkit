import { describe, expect, it } from 'vitest'

import { isPastedPathLike } from './pasted-path.js'

describe('isPastedPathLike', () => {
  it('rejects an empty string', () => {
    expect(isPastedPathLike('')).toBe(false)
  })

  it('rejects text at the length boundary (3 characters) even with a separator', () => {
    expect(isPastedPathLike('a/b')).toBe(false)
  })

  it('rejects text at the length boundary (3 characters) without a separator', () => {
    expect(isPastedPathLike('abc')).toBe(false)
  })

  it('rejects text just over the boundary (4 characters) without a separator', () => {
    expect(isPastedPathLike('abcd')).toBe(false)
  })

  it('accepts text just over the boundary (4 characters) with a forward slash', () => {
    expect(isPastedPathLike('a/bc')).toBe(true)
  })

  it('accepts text just over the boundary (4 characters) with a backslash', () => {
    expect(isPastedPathLike('a\\bc')).toBe(true)
  })

  it('accepts a realistic pasted Windows path', () => {
    expect(isPastedPathLike('C:\\SteamLibrary\\stellaris')).toBe(true)
  })

  it('accepts a realistic pasted posix path', () => {
    expect(isPastedPathLike('/home/user/stellaris')).toBe(true)
  })

  it('rejects a long piece of text with no path separator', () => {
    expect(isPastedPathLike('stellaris mod name here')).toBe(false)
  })
})
