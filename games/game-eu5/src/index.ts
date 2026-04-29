import type { GameDefinition } from '@ptt/shared-types'

export const eu5: GameDefinition = {
  id: 'eu5',
  displayName: 'Europa Universalis V',
  steamAppId: 3450310,
  localisationDirName: 'localization',
  layout: 'both',
  languageFileToken: {
    en: 'english',
    'pt-BR': 'braz_por',
    fr: 'french',
    de: 'german',
    pl: 'polish',
    ru: 'russian',
    es: 'spanish',
    ja: 'japanese',
    'zh-Hans': 'simp_chinese',
    ko: 'korean',
    tr: 'turkish'
  },
  overrideSubdirs: ['replace']
}

export default eu5
