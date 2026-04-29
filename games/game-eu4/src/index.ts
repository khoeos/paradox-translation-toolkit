import type { GameDefinition } from '@ptt/shared-types'

export const eu4: GameDefinition = {
  id: 'eu4',
  displayName: 'Europa Universalis IV',
  steamAppId: 236850,
  localisationDirName: 'localisation',
  layout: 'both',
  languageFileToken: {
    en: 'english',
    fr: 'french',
    de: 'german',
    es: 'spanish'
  },
  overrideSubdirs: ['replace']
}

export default eu4
