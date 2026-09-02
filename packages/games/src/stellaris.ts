import type { GameDefinition } from '@ptt/shared'

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
  overrideSubdirs: ['replace'],
  userFolder: 'Stellaris',
  domain:
    'Stellaris, a science fiction grand strategy game set in space. Expect interstellar empires, species and pops, star systems and hyperlanes, megastructures, ascension perks, planetary districts, fleets and warfare, alien civilisations and anomalies.'
}

export default stellaris
