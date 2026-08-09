import { LANGUAGE_CODES } from '@ptt/shared'
import type { LanguageCode } from '@ptt/shared'

/*
 * Ported from PR #4 (e21ee7a, `src/main/translate/providers.ts` `ISO_CODES`) by
 * Artem Kondrashev, inverted: the original keyed on the English language name, but every
 * caller here holds a canonical `LanguageCode`, so a name-keyed map has no lookup to answer.
 */

/** How the language is named in the prompt. A model reads "Russian", not "ru". */
export const LANGUAGE_DISPLAY_NAMES: Record<LanguageCode, string> = {
  en: 'English',
  fr: 'French',
  de: 'German',
  es: 'Spanish',
  pl: 'Polish',
  'pt-BR': 'Brazilian Portuguese',
  ru: 'Russian',
  'zh-Hans': 'Simplified Chinese',
  ko: 'Korean',
  ja: 'Japanese',
  tr: 'Turkish'
}

/** The RapidAPI hub wants short service codes rather than names. */
export const RAPIDAPI_CODES: Record<LanguageCode, string> = {
  en: 'en',
  fr: 'fr',
  de: 'de',
  es: 'es',
  pl: 'pl',
  'pt-BR': 'pt',
  ru: 'ru',
  'zh-Hans': 'zh',
  ko: 'ko',
  ja: 'ja',
  tr: 'tr'
}

/** Every registered language has both mappings, asserted by a test rather than by hope. */
export const MAPPED_LANGUAGE_CODES: readonly LanguageCode[] = LANGUAGE_CODES
