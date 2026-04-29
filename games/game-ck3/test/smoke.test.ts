import { describe, expect, it } from 'vitest'

import { ck3 } from '../src/index.js'

describe('@ptt/game-ck3', () => {
  it('exports a valid GameDefinition', () => {
    expect(ck3.id).toBe('ck3')
    expect(ck3.displayName).toBe('Crusader Kings III')
  })

  it('uses the American "localization" spelling for the directory', () => {
    expect(ck3.localisationDirName).toBe('localization')
  })

  it('lists Korean as a supported language', () => {
    expect(ck3.languageFileToken.ko).toBe('korean')
  })

  it('has a Steam App ID', () => {
    expect(ck3.steamAppId).toBe(1158310)
  })
})
