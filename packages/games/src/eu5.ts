import type { GameDefinition } from '@ptt/shared'

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
  overrideSubdirs: ['replace'],
  userFolder: 'Europa Universalis V',
  domain:
    'Europa Universalis V, a grand strategy game covering the late Middle Ages to the early modern era. Expect locations and provinces, population estates and social classes, control and administration, trade goods and markets, cabinet actions, characters and dynasties, religion and cultures.'
}

export default eu5
