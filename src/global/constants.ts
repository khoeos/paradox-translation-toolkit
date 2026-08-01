export const LANGUAGES = {
  en: 'English',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  pl: 'Polish',
  pt: 'Portuguese',
  ru: 'Russian',
  zh: 'Chinese',
  kr: 'korean',
  jp: 'japanese'
}

export const LANGUAGES_KEYS = Object.keys(LANGUAGES) as Array<keyof typeof LANGUAGES>

export enum translateKey {
  localisation = 'localisation',
  localization = 'localization'
}

export const DEFAULT_LANGUAGE_KEYS = {
  en: 'english',
  fr: 'french',
  de: 'german',
  es: 'spanish',
  pl: 'polish',
  pt: 'portuguese',
  ru: 'russian',
  zh: 'chinese',
  kr: 'korean',
  jp: 'japanese'
}
//

export interface Game {
  id: number
  key: GameId
  name: string
  translateKey: translateKey
  /** Folder name under Documents\Paradox Interactive holding the user mods */
  userFolder: string
  /**
   * What the game is about, handed to the translator.
   * Without it a translator has no idea that CK3 "Wroth" is a character trait and
   * renders it as the noun "anger" instead of the adjective the game uses.
   */
  domain: string
  languageKeys: Record<keyof typeof LANGUAGES, string>
}

export type GameId = 'stl' | 'hoi4' | 'eu4' | 'ck3' | 'vic3'

export type Games = {
  [key in GameId]: Game
}

export const ACTIVE_GAMES = ['stl', 'hoi4', 'eu4', 'ck3']

export const GAMES: Games = {
  stl: {
    id: 281990,
    key: 'stl',
    name: 'Stellaris',
    translateKey: translateKey.localisation,
    userFolder: 'Stellaris',
    domain:
      'Stellaris, a science fiction grand strategy game set in space. Expect interstellar empires, species and pops, star systems and hyperlanes, megastructures, ascension perks, planetary districts, fleets and warfare, alien civilisations and anomalies.',
    languageKeys: { ...DEFAULT_LANGUAGE_KEYS, pt: 'braz_por', zh: 'simp_chinese' }
  },
  hoi4: {
    id: 394360,
    key: 'hoi4',
    name: 'Hearts of Iron IV',
    translateKey: translateKey.localisation,
    userFolder: 'Hearts of Iron IV',
    domain:
      'Hearts of Iron IV, a Second World War grand strategy game. Expect divisions and templates, national focus trees, national spirits, equipment and production, generals and field marshals, doctrines, supply, resistance and compliance.',
    languageKeys: DEFAULT_LANGUAGE_KEYS
  },
  eu4: {
    id: 236850,
    key: 'eu4',
    name: 'Europa Universalis IV',
    translateKey: translateKey.localisation,
    userFolder: 'Europa Universalis IV',
    domain:
      'Europa Universalis IV, an early modern grand strategy game covering 1444 to 1821. Expect provinces and states, casus belli and truces, monarch power, idea groups, estates, trade nodes, colonisation, religion and rebels.',
    languageKeys: DEFAULT_LANGUAGE_KEYS
  },
  ck3: {
    id: 1158310,
    key: 'ck3',
    name: 'Crusader Kings III',
    translateKey: translateKey.localization,
    userFolder: 'Crusader Kings III',
    domain:
      'Crusader Kings III, a medieval feudal dynasty role playing game. Expect titles and vassals, character traits, casus belli and claims, dynasties and houses, culture and faith, men-at-arms and knights, schemes, stress and dread, council and court.',
    languageKeys: DEFAULT_LANGUAGE_KEYS
  },
  vic3: {
    id: 0,
    key: 'vic3',
    name: 'Victoria III',
    translateKey: translateKey.localisation,
    userFolder: 'Victoria 3',
    domain:
      'Victoria 3, a 19th century society and economy grand strategy game. Expect population groups and professions, laws and political movements, trade goods and production methods, construction, interest groups and diplomatic plays.',
    languageKeys: DEFAULT_LANGUAGE_KEYS
  }
}
