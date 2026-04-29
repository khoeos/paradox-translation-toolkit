import { describe, expect, it } from 'vitest'

import { eu5 } from '../src/index.js'

describe('@ptt/game-eu5', () => {
  it('exports a valid GameDefinition', () => {
    expect(eu5.id).toBe('eu5')
    expect(eu5.displayName).toBe('Europa Universalis V')
    expect(eu5.localisationDirName).toBe('localization')
  })

  it('lists the four officially supported languages', () => {
    expect(eu5.languageFileToken.en).toBe('english')
    expect(eu5.languageFileToken.fr).toBe('french')
    expect(eu5.languageFileToken.de).toBe('german')
    expect(eu5.languageFileToken.es).toBe('spanish')
  })

  it('has a Steam App ID', () => {
    expect(eu5.steamAppId).toBe(3450310)
  })
})
