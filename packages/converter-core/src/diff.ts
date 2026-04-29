import type { LanguageCode } from '@ptt/shared-types'

import type { DiffOptions, DiffPlan, DiscoveredFile, ScanResult } from './types.js'

export function diff(
  scanResult: ScanResult,
  sourceLanguage: LanguageCode,
  targetLanguages: LanguageCode[],
  options: DiffOptions = {}
): DiffPlan {
  const { overwrite = false } = options
  const presence = new Map<string, Set<LanguageCode>>()
  for (const f of scanResult.files) {
    const key = `${f.modRoot} ${f.canonicalKey}`
    let set = presence.get(key)
    if (!set) {
      set = new Set()
      presence.set(key, set)
    }
    set.add(f.language)
  }

  const sourceFiles = scanResult.files.filter(f => f.language === sourceLanguage)

  const missingFiles: Partial<Record<LanguageCode, DiscoveredFile[]>> = {}
  for (const targetLang of targetLanguages) {
    if (targetLang === sourceLanguage) continue
    const missing: DiscoveredFile[] = []
    for (const sf of sourceFiles) {
      const key = `${sf.modRoot} ${sf.canonicalKey}`
      const presentLangs = presence.get(key)
      if (overwrite || !presentLangs?.has(targetLang)) {
        missing.push(sf)
      }
    }
    if (missing.length > 0) missingFiles[targetLang] = missing
  }

  return { sourceLanguage, targetLanguages, missingFiles }
}
