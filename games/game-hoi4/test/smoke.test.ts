import { describe, expect, it } from 'vitest'

import { hoi4 } from '../src/index.js'

describe('@ptt/game-hoi4', () => {
  it('exports a valid GameDefinition', () => {
    expect(hoi4.id).toBe('hoi4')
    expect(hoi4.displayName).toBe('Hearts of Iron IV')
    expect(hoi4.localisationDirName).toBe('localisation')
  })

  it('uses braz_por for Portuguese', () => {
    expect(hoi4.languageFileToken['pt-BR']).toBe('braz_por')
  })

  it('has a Steam App ID', () => {
    expect(hoi4.steamAppId).toBe(394360)
  })
})
