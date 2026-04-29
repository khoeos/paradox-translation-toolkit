import i18next, { type i18n } from 'i18next'

import en from './locales/en.json' with { type: 'json' }
import fr from './locales/fr.json' with { type: 'json' }
import zh from './locales/zh.json' with { type: 'json' }

/**
 * Source of truth for the UI languages we ship.
 * Declared as a literal tuple so consumers (e.g. `z.enum(...)`) can derive
 * a strict union from it at the type level.
 */
export const VALID_UI_LANGUAGES = ['en', 'fr', 'zh'] as const

export type UiLanguage = (typeof VALID_UI_LANGUAGES)[number]

export const UI_LANGUAGES: ReadonlyArray<{ code: UiLanguage; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'Français' },
  { code: 'zh', label: '中文' }
]

export const DEFAULT_UI_LANGUAGE: UiLanguage = 'en'

export function isUiLanguage(value: unknown): value is UiLanguage {
  return typeof value === 'string' && (VALID_UI_LANGUAGES as readonly string[]).includes(value)
}

export const resources = {
  en: { translation: en },
  fr: { translation: fr },
  zh: { translation: zh }
} as const

export interface InitOptions {
  /** UI language to start in. Falls back to English if omitted. */
  lng?: UiLanguage
  /** Optional override for the i18next instance, defaults to the global one. */
  instance?: i18n
}

export function initI18n(opts: InitOptions = {}): i18n {
  const i = opts.instance ?? i18next
  void i.init({
    resources,
    lng: opts.lng ?? DEFAULT_UI_LANGUAGE,
    fallbackLng: DEFAULT_UI_LANGUAGE,
    interpolation: { escapeValue: false },
    returnNull: false,
    returnEmptyString: false
  })
  return i
}

/** Map a `navigator.language`-style string to one of our UI languages. */
export function detectBrowserLanguage(navigatorLanguage: string | undefined): UiLanguage {
  if (
    typeof navigatorLanguage === 'string' &&
    navigatorLanguage.slice(0, 2).toLowerCase() === 'fr'
  ) {
    return 'fr'
  } else if (
    typeof navigatorLanguage === 'string' &&
    navigatorLanguage.slice(0, 2).toLowerCase() === 'zh'
  ) {
    return 'zh'
  }
  return DEFAULT_UI_LANGUAGE
}

export type TranslationSchema = typeof en
