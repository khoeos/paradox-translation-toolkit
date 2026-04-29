import { describe, expect, it } from 'vitest'

import { stellaris } from '../src/index.js'

describe('@ptt/game-stellaris', () => {
  it('exports a valid GameDefinition', () => {
    expect(stellaris.id).toBe('stellaris')
    expect(stellaris.displayName).toBe('Stellaris')
    expect(stellaris.localisationDirName).toBe('localisation')
  })

  it('uses Stellaris-specific tokens for Portuguese and Chinese', () => {
    expect(stellaris.languageFileToken['pt-BR']).toBe('braz_por')
    expect(stellaris.languageFileToken['zh-Hans']).toBe('simp_chinese')
  })

  it('lists English as a supported language', () => {
    expect(stellaris.languageFileToken.en).toBe('english')
  })

  it('declares replace as an override subdir', () => {
    expect(stellaris.overrideSubdirs).toContain('replace')
  })

  it('has a Steam App ID', () => {
    expect(stellaris.steamAppId).toBe(281990)
  })
})
