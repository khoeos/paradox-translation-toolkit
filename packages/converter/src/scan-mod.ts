/**
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts` `scanMod`) by Artem Kondrashev.
 */

import type { LanguageCode } from '@ptt/shared'

import { countTranslatableLines, pendingCount, planMod } from './key-plan.js'
import type { FsLike, KeyPlanOptions, KeyReport, ModFolder, ScannedMod } from './types.js'

export interface ScanModResult {
  scanned: ScannedMod
  keyStates: KeyReport[]
}

/**
 * Report what one mod is missing, creating nothing.
 * @param mod - The mod folder
 * @param options - How to plan, see `KeyPlanOptions`
 * @param fs - The injected filesystem
 * @param countLines - Estimate the translation workload, which costs a full read of the values
 * @returns The scan row for that mod, and its key states when they were asked for
 */
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

  // Every requested language gets an entry, so "nothing missing" is stated rather than implied.
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
    // A file whose keys are all carried over from an earlier run is no work: it is rewritten
    // unchanged and must not be reported as missing.
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
      errors: plan.errors
    }
  }
}
