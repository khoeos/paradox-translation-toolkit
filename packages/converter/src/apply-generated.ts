import { buildTargetContent } from './build-target.js'
import { mapWithConcurrency } from './concurrency.js'
import { MOD_CONCURRENCY } from './constants.js'
import { pathKey, posixContains, posixDirname, posixJoin, posixSplit } from './path.js'
import { canPrune, pruneNamespace } from './prune.js'
import { describeInPlaceShadowing, resolveTargets } from './target.js'
import type { ResolvedTarget } from './target.js'
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
  | { outcome: 'written'; target: string }
  | { outcome: 'skipped' }
  | { outcome: 'unchanged' }
  | { outcome: 'failed'; target: string; error: string }

export async function applyModJobs(options: ApplyModOptions, fs: FsLike): Promise<ModResult> {
  const { plan, mod, gameDef, sourceLanguage, targets, destination } = options
  const { translations, isCancelled, onFileWritten } = options

  const resolved = resolveTargets(gameDef, sourceLanguage, targets)
  const byLanguage = new Map<string, ResolvedTarget>()
  for (const target of resolved.targets) byLanguage.set(target.language, target)

  const created: Partial<Record<string, string[]>> = {}
  const warnings: string[] = [...plan.warnings]
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
    warnings
  }

  const producedByLanguage = new Map<string, Set<string>>()
  let cancelled = false

  for (const [language, jobs] of Object.entries(plan.jobs)) {
    if (isCancelled?.() === true) {
      cancelled = true
      break
    }
    const target = byLanguage.get(language)
    if (target === undefined || !jobs) continue

    if (destination.kind === 'in-place' && target.shadowsLanguage !== undefined) {
      const replacing = jobs.some(job => job.content !== 'missing-keys')
      warnings.push(describeInPlaceShadowing(target, target.shadowsLanguage, replacing))
    }

    const targetToken = target.fileToken
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
        const path = resolveDestination(job, mod.path, gameDef, plan, targetToken, destination)

        const sandbox = sandboxRoot(mod.path, destination)
        if (!posixContains(sandbox, path)) {
          throw new Error(`Refusing to write outside "${sandbox}": ${path}`)
        }

        const dir = posixDirname(path)
        if (dir.length > 0) await fs.mkdir(dir, { recursive: true })

        if (destination.kind === 'translation-mod') produced.add(pathKey(path))

        if (job.content === 'missing-keys' && destination.kind !== 'translation-mod') {
          if (await fs.exists(path)) return { outcome: 'skipped' }
        }

        const before = await fs.readFile(path, 'utf-8').catch(() => undefined)
        if (before === content) return { outcome: 'unchanged' }

        const replacing = job.content !== 'missing-keys' && (await fs.exists(path))
        await writeAtomic(path, content, fs, replacing)
        return { outcome: 'written', target: path }
      } catch (err) {
        return { outcome: 'failed', target: job.target, error: stringifyError(err) }
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
        targets: resolved.targets,
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
  targetToken: string,
  destination: Destination
): string {
  if (destination.kind === 'translation-mod') {
    return posixJoin(
      destination.mod.path,
      gameDef.localisationDirName,
      targetToken,
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
): Promise<void> {
  const temporary = `${target}.tmp`
  let copied = false
  try {
    await fs.writeFile(temporary, content, 'utf-8')
    if (backup) {
      try {
        await fs.copyFile(target, `${target}.bak`)
        copied = true
      } catch (err) {
        throw new Error(`could not back up to ${target}.bak : ${stringifyError(err)}`, {
          cause: err
        })
      }
    }
    await fs.rename(temporary, target)
  } catch (err) {
    await fs.unlink(temporary).catch(() => {})
    if (copied) await fs.unlink(`${target}.bak`).catch(() => {})
    throw err
  }
}
