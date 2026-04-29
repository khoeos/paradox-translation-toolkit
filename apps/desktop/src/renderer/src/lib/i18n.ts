import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'

import { initI18n, type UiLanguage } from '@ptt/i18n'

// Eager init; language is later hydrated by `useUiLanguageSync`.
i18next.use(initReactI18next)
initI18n({ instance: i18next })

export { i18next }

export async function setUiLanguage(lng: UiLanguage): Promise<void> {
  await i18next.changeLanguage(lng)
}
