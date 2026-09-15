import { describe, expect, it } from 'vitest'

import { buildDetectedSuggestions, toPathDisplay, type DetectedPaths } from './detected-paths.js'

const makePaths = (overrides: Partial<DetectedPaths> = {}): DetectedPaths => ({
  workshopContentPaths: [],
  steamLibraries: [],
  ...overrides
})

describe('buildDetectedSuggestions', () => {
  it('returns nothing when every field is empty', () => {
    expect(buildDetectedSuggestions(makePaths(), 'modFolder')).toEqual([])
    expect(buildDetectedSuggestions(makePaths(), 'gameInstall')).toEqual([])
  })

  it('lists each workshop path then userModsFolder in that order for modFolder', () => {
    const paths = makePaths({
      workshopContentPaths: ['/steam/workshop/1', '/steam/workshop/2'],
      userModsFolder: '/documents/stellaris/mod'
    })

    expect(buildDetectedSuggestions(paths, 'modFolder')).toEqual([
      { kind: 'workshopContent', path: '/steam/workshop/1' },
      { kind: 'workshopContent', path: '/steam/workshop/2' },
      { kind: 'userModsFolder', path: '/documents/stellaris/mod' }
    ])
  })

  it('never suggests an install folder, Steam or GOG, for modFolder since neither holds mods', () => {
    const paths = makePaths({
      installDir: '/steam/stellaris',
      gogInstall: '/gog/stellaris',
      userModsFolder: '/documents/stellaris/mod'
    })

    expect(buildDetectedSuggestions(paths, 'modFolder')).toEqual([
      { kind: 'userModsFolder', path: '/documents/stellaris/mod' }
    ])
  })

  it('lists installDir then gogInstall in that order for gameInstall', () => {
    const paths = makePaths({
      installDir: '/steam/stellaris',
      gogInstall: '/gog/stellaris',
      userModsFolder: '/documents/stellaris/mod',
      workshopContentPaths: ['/steam/workshop/1']
    })

    expect(buildDetectedSuggestions(paths, 'gameInstall')).toEqual([
      { kind: 'installDir', path: '/steam/stellaris' },
      { kind: 'gogInstall', path: '/gog/stellaris' }
    ])
  })

  it('omits fields that are absent without leaving gaps', () => {
    const paths = makePaths({ userModsFolder: '/documents/stellaris/mod' })
    expect(buildDetectedSuggestions(paths, 'modFolder')).toEqual([
      { kind: 'userModsFolder', path: '/documents/stellaris/mod' }
    ])
  })

  it('filters out an empty string field instead of producing an empty suggestion', () => {
    const paths = makePaths({ userModsFolder: '' })
    expect(buildDetectedSuggestions(paths, 'modFolder')).toEqual([])
  })

  it('filters out a whitespace-only field', () => {
    const paths = makePaths({ userModsFolder: '   ', gogInstall: '\t' })
    expect(buildDetectedSuggestions(paths, 'modFolder')).toEqual([])
    expect(buildDetectedSuggestions(paths, 'gameInstall')).toEqual([])
  })

  it('filters out an empty string among the workshop content paths', () => {
    const paths = makePaths({ workshopContentPaths: ['/steam/workshop/1', ''] })
    expect(buildDetectedSuggestions(paths, 'modFolder')).toEqual([
      { kind: 'workshopContent', path: '/steam/workshop/1' }
    ])
  })

  it('deduplicates userModsFolder against an identical workshop path', () => {
    const paths = makePaths({
      workshopContentPaths: ['/steam/workshop/content/281990/123'],
      userModsFolder: '/steam/workshop/content/281990/123'
    })
    expect(buildDetectedSuggestions(paths, 'modFolder')).toEqual([
      { kind: 'workshopContent', path: '/steam/workshop/content/281990/123' }
    ])
  })
})

describe('toPathDisplay', () => {
  it('keeps a short path as the title with a placeholder subtitle', () => {
    expect(toPathDisplay('C:/SteamLibrary/stellaris')).toEqual({
      title: 'C:/SteamLibrary/stellaris',
      subtitle: '-'
    })
  })

  it('splits a truncated path into the meaningful tail as title and the marked prefix as subtitle', () => {
    const path = 'C:/SteamLibrary/steamapps/workshop/content/281990/123456'
    expect(toPathDisplay(path)).toEqual({
      title: 'content/281990/123456',
      subtitle: 'C:/SteamLibrary/…'
    })
  })

  it('truncates a Windows path around its localisation segment, keeping the marker on the subtitle', () => {
    const path = 'C:\\Steam\\steamapps\\common\\Stellaris\\localisation\\english\\foo_l_english.yml'
    expect(toPathDisplay(path)).toEqual({
      title: 'common/Stellaris/localisation/english/foo_l_english.yml',
      subtitle: 'C:/Steam/…'
    })
  })

  it('truncates a path with mixed forward and back slashes', () => {
    const path = 'C:\\SteamLibrary/steamapps\\workshop/content\\281990/123456'
    expect(toPathDisplay(path)).toEqual({
      title: 'content/281990/123456',
      subtitle: 'C:/SteamLibrary/…'
    })
  })

  it('does not mistake a literal "…" folder for a truncation marker', () => {
    expect(toPathDisplay('/mods/…/config')).toEqual({
      title: '/mods/…/config',
      subtitle: '-'
    })
  })
})
