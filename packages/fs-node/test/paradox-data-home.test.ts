import { describe, expect, it } from 'vitest'

import { nodeParadoxDataHome, resolveParadoxDataHome } from '../src/paradox-data-home.js'

const HOME = '/home/x'
const DOCUMENTS = '/home/x/Documents'

describe('resolveParadoxDataHome', () => {
  it('honours XDG_DATA_HOME on Linux', () => {
    expect(resolveParadoxDataHome('linux', HOME, DOCUMENTS, '/xdg/data')).toBe('/xdg/data')
  })

  it('falls back to ~/.local/share on Linux when XDG_DATA_HOME is unset', () => {
    expect(resolveParadoxDataHome('linux', HOME, DOCUMENTS, undefined)).toBe('/home/x/.local/share')
  })

  it('falls back to ~/.local/share on Linux when XDG_DATA_HOME is empty', () => {
    expect(resolveParadoxDataHome('linux', HOME, DOCUMENTS, '')).toBe('/home/x/.local/share')
  })

  it('falls back to ~/.local/share on Linux when XDG_DATA_HOME is whitespace only', () => {
    expect(resolveParadoxDataHome('linux', HOME, DOCUMENTS, '   ')).toBe('/home/x/.local/share')
  })

  it('returns the Documents path unchanged on macOS', () => {
    expect(resolveParadoxDataHome('darwin', HOME, DOCUMENTS, undefined)).toBe(DOCUMENTS)
  })

  it('returns the Documents path unchanged on Windows', () => {
    expect(resolveParadoxDataHome('win32', HOME, DOCUMENTS, undefined)).toBe(DOCUMENTS)
  })
})

describe('nodeParadoxDataHome', () => {
  it('does not throw and returns the Documents path on the current platform (macOS)', () => {
    expect(() => nodeParadoxDataHome(DOCUMENTS)).not.toThrow()
    expect(nodeParadoxDataHome(DOCUMENTS)).toBe(DOCUMENTS)
  })
})
