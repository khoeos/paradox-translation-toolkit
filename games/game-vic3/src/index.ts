import type { GameDefinition } from '@ptt/shared-types'

export const vic3: GameDefinition = {
  id: 'vic3',
  displayName: 'Victoria 3',
  steamAppId: 529340,
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

export default vic3
