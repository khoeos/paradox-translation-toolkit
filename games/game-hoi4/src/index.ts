import type { GameDefinition } from '@ptt/shared-types'

export const hoi4: GameDefinition = {
  id: 'hoi4',
  displayName: 'Hearts of Iron IV',
  steamAppId: 394360,
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
    ja: 'japanese',
    ko: 'korean'
  },
  overrideSubdirs: ['replace']
}

export default hoi4
