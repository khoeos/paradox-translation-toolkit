import type { LanguageCode } from '@ptt/shared'

import { pathKey, posixJoin } from './path.js'
import type { FsLike, GameContextRef, ModPlan, TranslationMod } from './types.js'
import { stringifyError, walkFiles } from './walk.js'

export interface PruneOptions {
  translationMod: TranslationMod
  gameDef: GameContextRef
  namespace: string
  languages: readonly LanguageCode[]
  produced: Map<LanguageCode, Set<string>>
}

export interface PruneReport {
  removed: number
  errors: string[]
}

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

export function canPrune(plan: ModPlan, cancelled: boolean): boolean {
  return !cancelled && plan.sourceKeys > 0 && plan.errors.length === 0
}
