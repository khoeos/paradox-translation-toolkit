import type { GameDefinition } from '@ptt/shared-types'

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
  overrideSubdirs: ['replace']
}

export default imperator
