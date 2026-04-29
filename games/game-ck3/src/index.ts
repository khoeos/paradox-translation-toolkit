import type { GameDefinition } from '@ptt/shared-types'

export const ck3: GameDefinition = {
  id: 'ck3',
  displayName: 'Crusader Kings III',
  steamAppId: 1158310,
  localisationDirName: 'localization',
  layout: 'both',
  languageFileToken: {
    en: 'english',
    fr: 'french',
    de: 'german',
    es: 'spanish',
    ru: 'russian',
    ko: 'korean',
    'zh-Hans': 'simp_chinese'
  },
  overrideSubdirs: ['replace']
}

export default ck3
