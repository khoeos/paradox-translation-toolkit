import { pathKey, posixJoin } from './path.js'
import type { ResolvedTarget } from './target.js'
import type { FsLike, GameContextRef, ModPlan, TranslationMod } from './types.js'
import { stringifyError, walkFiles } from './walk.js'

export interface PruneOptions {
  translationMod: TranslationMod
  gameDef: GameContextRef
  namespace: string
  targets: readonly ResolvedTarget[]
  produced: Map<string, Set<string>>
}

export interface PruneReport {
  removed: number
  errors: string[]
}

export async function pruneNamespace(options: PruneOptions, fs: FsLike): Promise<PruneReport> {
  const { translationMod, gameDef, namespace, targets, produced } = options
  const report: PruneReport = { removed: 0, errors: [] }

  for (const target of targets) {
    const folder = posixJoin(
      translationMod.path,
      gameDef.localisationDirName,
      target.fileToken,
      namespace
    )
    const kept = produced.get(target.language) ?? new Set<string>()

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
