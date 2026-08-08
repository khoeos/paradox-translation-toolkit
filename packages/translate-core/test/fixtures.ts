import type { GameContextRef } from '@ptt/converter-core'

/** Stellaris, reduced to what the mod readers actually consume. */
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
