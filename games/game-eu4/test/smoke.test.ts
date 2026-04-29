import { describe, expect, it } from 'vitest'

import { eu4 } from '../src/index.js'

describe('@ptt/game-eu4', () => {
  it('exports a valid GameDefinition', () => {
    expect(eu4.id).toBe('eu4')
    expect(eu4.displayName).toBe('Europa Universalis IV')
    expect(eu4.localisationDirName).toBe('localisation')
  })

  it('lists the four officially supported languages', () => {
    expect(eu4.languageFileToken.en).toBe('english')
    expect(eu4.languageFileToken.fr).toBe('french')
    expect(eu4.languageFileToken.de).toBe('german')
    expect(eu4.languageFileToken.es).toBe('spanish')
  })

  it('has a Steam App ID', () => {
    expect(eu4.steamAppId).toBe(236850)
  })
})
