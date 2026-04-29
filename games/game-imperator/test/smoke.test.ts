import { describe, expect, it } from 'vitest'

import { imperator } from '../src/index.js'

describe('@ptt/game-imperator', () => {
  it('exports a valid GameDefinition', () => {
    expect(imperator.id).toBe('imperator')
    expect(imperator.displayName).toBe('Imperator: Rome')
    expect(imperator.localisationDirName).toBe('localization')
  })

  it('lists the supported languages', () => {
    expect(imperator.languageFileToken.en).toBe('english')
    expect(imperator.languageFileToken.fr).toBe('french')
    expect(imperator.languageFileToken.de).toBe('german')
    expect(imperator.languageFileToken.ru).toBe('russian')
    expect(imperator.languageFileToken.es).toBe('spanish')
    expect(imperator.languageFileToken['zh-Hans']).toBe('simp_chinese')
  })

  it('has a Steam App ID', () => {
    expect(imperator.steamAppId).toBe(859580)
  })

  it('declares replace as an override subdir', () => {
    expect(imperator.overrideSubdirs).toContain('replace')
  })
})
