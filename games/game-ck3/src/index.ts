import type { GameDefinition } from '@ptt/shared'

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
  overrideSubdirs: ['replace'],
  userFolder: 'Crusader Kings III',
  domain:
    'Crusader Kings III, a medieval feudal dynasty role playing game. Expect titles and vassals, character traits, casus belli and claims, dynasties and houses, culture and faith, men-at-arms and knights, schemes, stress and dread, council and court.'
}

export default ck3
