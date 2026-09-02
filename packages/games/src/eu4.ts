import type { GameDefinition } from '@ptt/shared'

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
  overrideSubdirs: ['replace'],
  userFolder: 'Europa Universalis IV',
  domain:
    'Europa Universalis IV, an early modern grand strategy game covering 1444 to 1821. Expect provinces and states, casus belli and truces, monarch power, idea groups, estates, trade nodes, colonisation, religion and rebels.'
}

export default eu4
