import { LANGUAGE_CODES } from '@ptt/shared/languages'
import type { LanguageCode } from '@ptt/shared/languages'

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
