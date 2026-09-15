import { describe, expect, it } from 'vitest'

import { toPlatform } from '../src/platform.js'

describe('toPlatform', () => {
  it('recognizes win32', () => {
    expect(toPlatform('win32')).toBe('win32')
  })

  it('recognizes darwin', () => {
    expect(toPlatform('darwin')).toBe('darwin')
  })

  it('recognizes linux', () => {
    expect(toPlatform('linux')).toBe('linux')
  })

  it('falls back to linux for freebsd', () => {
    expect(toPlatform('freebsd')).toBe('linux')
  })

  it('falls back to linux for an arbitrary string', () => {
    expect(toPlatform('some-unknown-platform')).toBe('linux')
  })
})
