import { LANGUAGE_CODES } from '@ptt/shared'
import type { LanguageCode } from '@ptt/shared'

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

export const MAPPED_LANGUAGE_CODES: readonly LanguageCode[] = LANGUAGE_CODES
