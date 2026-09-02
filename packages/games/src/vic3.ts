import type { GameDefinition } from '@ptt/shared'

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
  overrideSubdirs: ['replace'],
  userFolder: 'Victoria 3',
  domain:
    'Victoria 3, a 19th century society and economy grand strategy game. Expect population groups and professions, laws and political movements, trade goods and production methods, construction, interest groups and diplomatic plays.'
}

export default vic3
