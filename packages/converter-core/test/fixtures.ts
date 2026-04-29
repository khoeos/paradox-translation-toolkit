import type { GameContextRef } from '../src/index.js'

const BOM = '﻿'

export const stellarisDef: GameContextRef = {
  id: 'stellaris',
  displayName: 'Stellaris',
  localisationDirName: 'localisation',
  layout: 'both',
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

export const ck3Def: GameContextRef = {
  ...stellarisDef,
  id: 'ck3',
  displayName: 'Crusader Kings III',
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

export function localeFile(language: string, entries: Array<[string, string]> = []): string {
  let content = `${BOM}l_${language}:\n`
  for (const [key, value] of entries) {
    content += ` ${key}:0 "${value}"\n`
  }
  return content
}
