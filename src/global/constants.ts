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
    languageKeys: { ...DEFAULT_LANGUAGE_KEYS, pt: 'braz_por', zh: 'simp_chinese' }
  },
  hoi4: {
    id: 394360,
    key: 'hoi4',
    name: 'Hearts of Iron IV',
    translateKey: translateKey.localisation,
    userFolder: 'Hearts of Iron IV',
    languageKeys: DEFAULT_LANGUAGE_KEYS
  },
  eu4: {
    id: 236850,
    key: 'eu4',
    name: 'Europa Universalis IV',
    translateKey: translateKey.localisation,
    userFolder: 'Europa Universalis IV',
    languageKeys: DEFAULT_LANGUAGE_KEYS
  },
  ck3: {
    id: 1158310,
    key: 'ck3',
    name: 'Crusader Kings III',
    translateKey: translateKey.localization,
    userFolder: 'Crusader Kings III',
    languageKeys: DEFAULT_LANGUAGE_KEYS
  },
  vic3: {
    id: 0,
    key: 'vic3',
    name: 'Victoria III',
    translateKey: translateKey.localisation,
    userFolder: 'Victoria 3',
    languageKeys: DEFAULT_LANGUAGE_KEYS
  }
}
