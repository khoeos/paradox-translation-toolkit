import type { GameDefinition } from '@ptt/shared'

export const imperator: GameDefinition = {
  id: 'imperator',
  displayName: 'Imperator: Rome',
  steamAppId: 859580,
  localisationDirName: 'localization',
  layout: 'both',
  languageFileToken: {
    en: 'english',
    fr: 'french',
    de: 'german',
    ru: 'russian',
    es: 'spanish',
    'zh-Hans': 'simp_chinese'
  },
  overrideSubdirs: ['replace'],
  userFolder: 'Imperator',
  domain:
    'Imperator: Rome, a classical antiquity grand strategy game covering the era of the Diadochi and the Roman Republic. Expect provinces and cities, population types and citizens, characters and loyalty, legions and cohorts, governors and provincial investment, religions and omens, senate parties and civil wars.'
}

export default imperator
