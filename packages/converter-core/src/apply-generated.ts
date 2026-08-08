import type { LanguageCode } from '@ptt/shared-types'

import { buildTargetContent } from './build-target.js'
import { mapWithConcurrency } from './concurrency.js'
import { MOD_CONCURRENCY } from './constants.js'
import { pathKey, posixDirname, posixJoin, posixSplit } from './path.js'
import { canPrune, pruneNamespace } from './prune.js'
import type {
  ApplyModOptions,
  CreationJob,
  Destination,
  FsLike,
  GameContextRef,
  ModPlan,
  ModResult
} from './types.js'
import { stringifyError } from './walk.js'

/*
 * Writing the files a mod plan asks for.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts` `processMod`, write half) by
 * Artem Kondrashev. Translation itself stays out: the caller hands in the translations it
 * obtained, so this package keeps knowing nothing about a backend.
 */

/**
 * Create the missing localisation files of one mod.
 *
 * Every failure is captured in the result: one broken mod never stops the others.
 * @param options - See `ApplyModOptions`
 * @param fs - The injected filesystem
 * @returns What was written, skipped, failed and pruned for this mod
 */
export async function applyModJobs(options: ApplyModOptions, fs: FsLike): Promise<ModResult> {
  const { plan, mod, gameDef, sourceLanguage, targetLanguages, destination } = options
  const { translations, isCancelled, onFileWritten } = options

  const created: Partial<Record<LanguageCode, string[]>> = {}
  const result: ModResult = {
    id: mod.id,
    name: plan.name,
    path: mod.path,
    localisationFiles: plan.localisationFiles,
    sourceFiles: plan.sourceFiles,
    createdCount: 0,
    skippedCount: 0,
    unchangedCount: 0,
    failedCount: 0,
    prunedCount: 0,
    created,
    ...(plan.supportedVersion !== undefined && { supportedVersion: plan.supportedVersion }),
    errors: [...plan.errors]
  }

  /** Files this run put into the generated mod, per language, so the rest can be pruned. */
  const producedByLanguage = new Map<LanguageCode, Set<string>>()
  let cancelled = false

  for (const [languageRaw, jobs] of Object.entries(plan.jobs)) {
    if (isCancelled?.() === true) {
      cancelled = true
      break
    }
    const language = languageRaw as LanguageCode
    const targetToken = gameDef.languageFileToken[language]
    if (targetToken === undefined || !jobs) continue

    const produced = new Set<string>()
    producedByLanguage.set(language, produced)
    const languageFiles: string[] = []

    const writes = await mapWithConcurrency(jobs, MOD_CONCURRENCY, async job => {
      try {
        const forLanguage = translations?.get(language)
        const content = await buildTargetContent(
          { job, targetToken, ...(forLanguage !== undefined && { translations: forLanguage }) },
          fs
        )
        const target = resolveDestination(job, mod.path, gameDef, plan, language, destination)

        const dir = posixDirname(target)
        if (dir.length > 0) await fs.mkdir(dir, { recursive: true })

        if (destination.kind === 'translation-mod') {
          // Our own generated mod is ours to rewrite: a previous run may have left source
          // language in it, and refusing to overwrite would make that first bad pass permanent.
          // Rewriting a file that did not change would only churn the disk, though.
          produced.add(pathKey(target))
          const before = await fs.readFile(target, 'utf-8').catch(() => undefined)
          if (before === content) return { outcome: 'unchanged' as const }
          await writeAtomic(target, content, fs)
          return { outcome: 'written' as const, target }
        }

        // Never overwrite somebody else's translation, even outside the scanned folder.
        if (await fs.exists(target)) return { outcome: 'skipped' as const }
        await writeAtomic(target, content, fs)
        return { outcome: 'written' as const, target }
      } catch (err) {
        return { outcome: 'failed' as const, target: job.target, error: stringifyError(err) }
      }
    })

    for (const write of writes) {
      if (write.outcome === 'written') {
        languageFiles.push(write.target)
        onFileWritten?.(write.target)
      } else if (write.outcome === 'skipped') {
        result.skippedCount++
      } else if (write.outcome === 'unchanged') {
        result.unchangedCount++
      } else {
        result.failedCount++
        result.errors.push(`${write.target} : ${write.error}`)
      }
    }

    if (languageFiles.length > 0) {
      result.createdCount += languageFiles.length
      created[language] = languageFiles
    }
  }

  if (destination.kind === 'translation-mod' && canPrune(plan, cancelled)) {
    const prune = await pruneNamespace(
      {
        translationMod: destination.mod,
        gameDef,
        namespace: plan.namespace,
        // Every requested language, so a language that became fully covered still gets its
        // stale generated files removed. Restricting this to the languages that had jobs
        // defeats the only reason pruning exists.
        languages: targetLanguages.filter(language => language !== sourceLanguage),
        produced: producedByLanguage
      },
      fs
    )
    result.prunedCount = prune.removed
    result.errors.push(...prune.errors)
  }

  return result
}

/** Where one job's output goes, per mode. */
function resolveDestination(
  job: CreationJob,
  modPath: string,
  gameDef: GameContextRef,
  plan: ModPlan,
  language: LanguageCode,
  destination: Destination
): string {
  if (destination.kind === 'translation-mod') {
    const token = gameDef.languageFileToken[language] ?? language
    // Namespaced per source mod, so two mods shipping the same file name never collide.
    return posixJoin(
      destination.mod.path,
      gameDef.localisationDirName,
      token,
      plan.namespace,
      ...job.packed
    )
  }
  if (destination.kind === 'output-dir') {
    return posixJoin(destination.outputDir, plan.namespace, relativeTo(modPath, job.target))
  }
  return job.target
}

/** The part of `target` below `modPath`, so an extracted tree mirrors the mod's own layout. */
function relativeTo(modPath: string, target: string): string {
  const base = posixSplit(modPath)
  const full = posixSplit(target)
  let index = 0
  while (index < base.length && base[index] === full[index]) index++
  return full.slice(index).join('/')
}

/** tmp then rename, so a crash mid-write leaves either the old file or the new one. */
async function writeAtomic(target: string, content: string, fs: FsLike): Promise<void> {
  const temporary = `${target}.tmp`
  try {
    await fs.writeFile(temporary, content, 'utf-8')
    await fs.rename(temporary, target)
  } catch (err) {
    await fs.unlink(temporary).catch(() => {})
    throw err
  }
}
