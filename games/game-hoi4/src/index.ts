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
  overrideSubdirs: ['replace'],
  userFolder: 'Hearts of Iron IV',
  domain:
    'Hearts of Iron IV, a Second World War grand strategy game. Expect divisions and templates, national focus trees, national spirits, equipment and production, generals and field marshals, doctrines, supply, resistance and compliance.'
}

export default hoi4
