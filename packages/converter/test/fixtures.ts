import type { GameDefinition, LanguageCode, TranslationTarget } from '@ptt/shared'
import { builtInTargetFor } from '@ptt/shared/languages'

import type { GameContextRef } from '../src/index.js'

const BOM = '﻿'

export const stellarisDef: GameContextRef = {
  localisationDirName: 'localisation',
  languageFileToken: {
    en: 'english',
    fr: 'french',
    de: 'german',
    es: 'spanish',
    pl: 'polish',
    'pt-BR': 'braz_por',
    ru: 'russian',
    'zh-Hans': 'simp_chinese',
    ko: 'korean',
    ja: 'japanese'
  },
  overrideSubdirs: ['replace']
}

export const stellarisGame: GameDefinition = {
  ...stellarisDef,
  id: 'stellaris',
  displayName: 'Stellaris',
  layout: 'both',
  userFolder: 'Stellaris',
  domain: 'a science-fiction grand strategy game'
}

export const ck3Def: GameContextRef = {
  ...stellarisDef,
  localisationDirName: 'localization',
  languageFileToken: {
    en: 'english',
    fr: 'french',
    de: 'german',
    es: 'spanish',
    pl: 'polish',
    'pt-BR': 'portuguese',
    ru: 'russian',
    'zh-Hans': 'chinese',
    ko: 'korean',
    ja: 'japanese'
  }
}

export const builtIn = (...languages: readonly LanguageCode[]): TranslationTarget[] =>
  languages.flatMap(language => builtInTargetFor(language, stellarisDef.languageFileToken) ?? [])

export function localeFile(language: string, entries: Array<[string, string]> = []): string {
  let content = `${BOM}l_${language}:\n`
  for (const [key, value] of entries) {
    content += ` ${key}:0 "${value}"\n`
  }
  return content
}
