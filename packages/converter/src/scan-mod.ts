import type { LanguageCode } from '@ptt/shared'

import { countTranslatableLines, pendingCount, planMod } from './key-plan.js'
import type { FsLike, KeyPlanOptions, KeyReport, ModFolder, ScannedMod } from './types.js'

export interface ScanModResult {
  scanned: ScannedMod
  keyStates: KeyReport[]
}

export async function scanMod(
  mod: ModFolder,
  options: KeyPlanOptions,
  fs: FsLike,
  countLines = false
): Promise<ScanModResult> {
  const plan = await planMod(mod, options, fs)

  const missing: Partial<Record<LanguageCode, number>> = {}
  const missingKeys: Partial<Record<LanguageCode, number>> = {}
  const coveredKeys: Partial<Record<LanguageCode, number>> = {}
  const englishKeys: Partial<Record<LanguageCode, number>> = {}
  const keptKeys: Partial<Record<LanguageCode, number>> = {}
  const shadowedKeys: Partial<Record<LanguageCode, number>> = {}
  let missingFiles = 0

  for (const language of options.targetLanguages) {
    if (language === options.sourceLanguage) continue
    missing[language] = 0
    missingKeys[language] = 0
    coveredKeys[language] = plan.covered[language] ?? 0
    englishKeys[language] = plan.english[language] ?? 0
    keptKeys[language] = plan.kept[language] ?? 0
    shadowedKeys[language] = plan.shadowed[language] ?? 0
  }

  for (const [languageRaw, jobs] of Object.entries(plan.jobs)) {
    const language = languageRaw as LanguageCode
    const pending = (jobs ?? []).filter(job => pendingCount(job) > 0)
    missing[language] = pending.length
    missingKeys[language] = pending.reduce((sum, job) => sum + pendingCount(job), 0)
    missingFiles += pending.length
  }

  return {
    keyStates: plan.keyStates,
    scanned: {
      id: mod.id,
      name: plan.name,
      path: mod.path,
      localisationFiles: plan.localisationFiles,
      sourceFiles: plan.sourceFiles,
      sourceKeys: plan.sourceKeys,
      otherSpelling: plan.otherSpelling,
      coveredBy: options.coverage?.sources ?? [],
      missing,
      missingKeys,
      coveredKeys,
      englishKeys,
      keptKeys,
      shadowedKeys,
      missingFiles,
      missingLines: countLines && missingFiles > 0 ? countTranslatableLines(plan.jobs) : 0,
      ...(plan.supportedVersion !== undefined && { supportedVersion: plan.supportedVersion }),
      errors: plan.errors,
      warnings: plan.warnings
    }
  }
}
