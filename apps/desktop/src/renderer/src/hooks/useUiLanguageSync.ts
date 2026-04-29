import { useEffect } from 'react'

import { detectBrowserLanguage, isUiLanguage } from '@ptt/i18n'

import { setUiLanguage } from '@renderer/lib/i18n'
import { trpc } from '@renderer/lib/trpc'

/**
 * Reads `uiLanguage` from settings and applies it to i18next.
 * Falls back to browser detection on first launch.
 */
export function useUiLanguageSync(): void {
  const { data: settings } = trpc.settings.getAll.useQuery()

  useEffect(() => {
    if (!settings) return
    const stored = (settings as { uiLanguage?: unknown }).uiLanguage
    const lng = isUiLanguage(stored) ? stored : detectBrowserLanguage(navigator.language)
    void setUiLanguage(lng)
  }, [settings])
}
