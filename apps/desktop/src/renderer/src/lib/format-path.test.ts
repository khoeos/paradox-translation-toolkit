import { describe, expect, it } from 'vitest'

import { formatPath, formatPathParts } from './format-path.js'

describe('formatPath', () => {
  it('keeps a short forward-slash path unchanged', () => {
    expect(formatPath('C:/SteamLibrary/stellaris')).toBe('C:/SteamLibrary/stellaris')
  })

  it('truncates a long forward-slash path around the localisation dir', () => {
    const path = 'C:/Steam/steamapps/common/Stellaris/localisation/english/foo_l_english.yml'
    expect(formatPath(path)).toBe(
      'C:/Steam/…/common/Stellaris/localisation/english/foo_l_english.yml'
    )
  })

  it('normalizes backslashes and truncates a native Windows path around the localisation dir', () => {
    const path =
      'C:\\Steam\\steamapps\\common\\Stellaris\\localisation\\english\\foo_l_english.yml'
    expect(formatPath(path)).toBe(
      'C:/Steam/…/common/Stellaris/localisation/english/foo_l_english.yml'
    )
  })

  it('normalizes and truncates a path with mixed forward and back slashes', () => {
    const path = 'C:\\SteamLibrary/steamapps\\workshop/content\\281990/123456'
    expect(formatPath(path)).toBe('C:/SteamLibrary/…/content/281990/123456')
  })

  it('normalizes a short native Windows path even without truncation', () => {
    expect(formatPath('C:\\SteamLibrary\\stellaris')).toBe('C:/SteamLibrary/stellaris')
  })

  it('does not report truncation for a short path whose segment is literally named "…"', () => {
    expect(formatPathParts('/mods/…/config')).toEqual({
      head: '',
      tail: '/mods/…/config',
      truncated: false
    })
  })
})
