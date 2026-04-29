import { describe, expect, it } from 'vitest'

import { vic3 } from '../src/index.js'

describe('@ptt/game-vic3', () => {
  it('exports a valid GameDefinition', () => {
    expect(vic3.id).toBe('vic3')
    expect(vic3.displayName).toBe('Victoria 3')
    expect(vic3.localisationDirName).toBe('localization')
  })

  it('lists the supported languages', () => {
    expect(vic3.languageFileToken.en).toBe('english')
    expect(vic3.languageFileToken['pt-BR']).toBe('braz_por')
    expect(vic3.languageFileToken.fr).toBe('french')
    expect(vic3.languageFileToken.de).toBe('german')
    expect(vic3.languageFileToken.pl).toBe('polish')
    expect(vic3.languageFileToken.ru).toBe('russian')
    expect(vic3.languageFileToken.es).toBe('spanish')
    expect(vic3.languageFileToken.ja).toBe('japanese')
    expect(vic3.languageFileToken['zh-Hans']).toBe('simp_chinese')
    expect(vic3.languageFileToken.ko).toBe('korean')
    expect(vic3.languageFileToken.tr).toBe('turkish')
  })

  it('has a Steam App ID', () => {
    expect(vic3.steamAppId).toBe(529340)
  })

  it('declares replace as an override subdir', () => {
    expect(vic3.overrideSubdirs).toContain('replace')
  })
})
