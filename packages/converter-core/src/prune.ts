import type { LanguageCode } from '@ptt/shared-types'

import { pathKey, posixJoin } from './path.js'
import type { FsLike, GameContextRef, ModPlan, TranslationMod } from './types.js'
import { stringifyError, walkFiles } from './walk.js'

/*
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts` `pruneNamespace`) by
 * Artem Kondrashev.
 */

export interface PruneOptions {
  translationMod: TranslationMod
  gameDef: GameContextRef
  /** The folder this source mod owns inside the generated mod. */
  namespace: string
  /** The target languages this run handled. */
  languages: readonly LanguageCode[]
  /** Files this run wrote, per language, so everything else in the namespace can go. */
  produced: Map<LanguageCode, Set<string>>
}

export interface PruneReport {
  removed: number
  errors: string[]
}

/**
 * Drop generated files this run no longer needs.
 *
 * A key covered since the last run, by the mod itself or by a localisation mod, leaves a file
 * behind that would keep shadowing the real translation. Only the folder this mod owns inside
 * the generated mod is touched, and only for the languages the run handled.
 * @param options - See `PruneOptions`
 * @param fs - The injected filesystem
 * @returns How many files were removed, and any deletion failure
 */
export async function pruneNamespace(options: PruneOptions, fs: FsLike): Promise<PruneReport> {
  const { translationMod, gameDef, namespace, languages, produced } = options
  const report: PruneReport = { removed: 0, errors: [] }

  for (const language of languages) {
    const token = gameDef.languageFileToken[language]
    if (token === undefined) continue
    const folder = posixJoin(translationMod.path, gameDef.localisationDirName, token, namespace)
    const kept = produced.get(language) ?? new Set<string>()

    const walked = await walkFiles(folder, fs, {
      acceptFile: lowerName => lowerName.endsWith('.yml')
    })

    for (const file of walked.files) {
      if (kept.has(pathKey(file))) continue
      try {
        await fs.unlink(file)
        report.removed++
      } catch (err) {
        report.errors.push(`${file} : ${stringifyError(err)}`)
      }
    }
  }

  return report
}

/**
 * Whether pruning a mod's namespace is safe.
 *
 * The guard that matters: an unreadable folder plans no job, and taking that for "nothing is
 * missing any more" would delete a good translation. So a mod is only pruned when it was read
 * without error and actually declares source keys.
 * @param plan - The plan of the source mod
 * @param cancelled - Whether the run was interrupted, which also plans fewer jobs than needed
 * @returns True when the namespace may be pruned
 */
export function canPrune(plan: ModPlan, cancelled: boolean): boolean {
  return !cancelled && plan.sourceKeys > 0 && plan.errors.length === 0
}
