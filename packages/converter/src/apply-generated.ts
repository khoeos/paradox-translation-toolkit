import type { LanguageCode } from '@ptt/shared'

import { buildTargetContent } from './build-target.js'
import { mapWithConcurrency } from './concurrency.js'
import { MOD_CONCURRENCY } from './constants.js'
import { pathKey, posixContains, posixDirname, posixJoin, posixSplit } from './path.js'
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

type Write =
  | { outcome: 'written'; target: string; backupError?: string }
  | { outcome: 'skipped' }
  | { outcome: 'unchanged' }
  | { outcome: 'failed'; target: string; error: string }

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
    errors: [...plan.errors],
    warnings: [...plan.warnings]
  }

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

    const writes = await mapWithConcurrency(jobs, MOD_CONCURRENCY, async (job): Promise<Write> => {
      try {
        const forLanguage = translations?.get(language)
        const content = await buildTargetContent(
          { job, targetToken, ...(forLanguage !== undefined && { translations: forLanguage }) },
          fs
        )
        const target = resolveDestination(job, mod.path, gameDef, plan, language, destination)

        const sandbox = sandboxRoot(mod.path, destination)
        if (!posixContains(sandbox, target)) {
          throw new Error(`Refusing to write outside "${sandbox}": ${target}`)
        }

        const dir = posixDirname(target)
        if (dir.length > 0) await fs.mkdir(dir, { recursive: true })

        if (destination.kind === 'translation-mod') produced.add(pathKey(target))

        if (job.content === 'missing-keys' && destination.kind !== 'translation-mod') {
          if (await fs.exists(target)) return { outcome: 'skipped' }
        }

        const before = await fs.readFile(target, 'utf-8').catch(() => undefined)
        if (before === content) return { outcome: 'unchanged' }

        const replacing = job.content !== 'missing-keys' && (await fs.exists(target))
        const { backupError } = await writeAtomic(target, content, fs, replacing)
        return {
          outcome: 'written',
          target,
          ...(backupError !== undefined && { backupError })
        }
      } catch (err) {
        return { outcome: 'failed', target: job.target, error: stringifyError(err) }
      }
    })

    for (const write of writes) {
      if (write.outcome === 'written') {
        languageFiles.push(write.target)
        if (write.backupError !== undefined) {
          result.errors.push(`${write.target}.bak : ${write.backupError}`)
        }
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

function sandboxRoot(modPath: string, destination: Destination): string {
  if (destination.kind === 'translation-mod') return destination.mod.path
  if (destination.kind === 'output-dir') return destination.outputDir
  return modPath
}

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

function relativeTo(modPath: string, target: string): string {
  const base = posixSplit(modPath)
  const full = posixSplit(target)
  let index = 0
  while (index < base.length && base[index] === full[index]) index++
  return full.slice(index).join('/')
}

async function writeAtomic(
  target: string,
  content: string,
  fs: FsLike,
  backup: boolean
): Promise<{ backupError?: string }> {
  const temporary = `${target}.tmp`
  let copied = false
  let backupError: string | undefined
  try {
    await fs.writeFile(temporary, content, 'utf-8')
    if (backup) {
      try {
        await fs.copyFile(target, `${target}.bak`)
        copied = true
      } catch (err) {
        backupError = stringifyError(err)
      }
    }
    await fs.rename(temporary, target)
  } catch (err) {
    await fs.unlink(temporary).catch(() => {})
    if (copied) await fs.unlink(`${target}.bak`).catch(() => {})
    throw err
  }
  return backupError !== undefined ? { backupError } : {}
}
