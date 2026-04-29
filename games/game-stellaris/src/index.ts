import type { GameDefinition } from '@ptt/shared-types'

export const stellaris: GameDefinition = {
  id: 'stellaris',
  displayName: 'Stellaris',
  steamAppId: 281990,
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

export default stellaris
