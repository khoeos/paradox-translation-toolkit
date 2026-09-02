import { isTranslatable } from '@ptt/parser'

import { readDescriptor } from './descriptor.js'
import { splitDiagnostics } from './diagnostics.js'
import { readModKeys } from './mod-keys.js'
import { getModNamespace, rewriteLanguageInPath, withPartialSuffix } from './naming.js'
import { pathKey, posixBasename, posixRejoin, posixSplit } from './path.js'
import type {
  CreationJob,
  FsLike,
  KeyPlanOptions,
  KeyReport,
  KeyState,
  LocalisationEntry,
  LocalisationFilePath,
  ModFolder,
  ModPlan
} from './types.js'

export function isUntranslated(generated: string, source: string): boolean {
  return generated.trim() === source.trim()
}

export function getTranslationModPath(
  file: LocalisationFilePath,
  targetPath: string,
  sourceToken: string
): string[] {
  const folders = file.rest.slice(0, -1)
  const languageIndex = folders.findIndex(segment => segment.toLowerCase() === sourceToken)
  const kept =
    languageIndex === -1
      ? folders
      : [...folders.slice(0, languageIndex), ...folders.slice(languageIndex + 1)]

  return [...kept, posixBasename(targetPath)]
}

export function pendingValues(job: CreationJob): string[] {
  return [...job.keys].filter(([key]) => !job.known.has(key)).map(([, value]) => value)
}

export function pendingCount(job: CreationJob): number {
  return job.keys.size - job.known.size
}

export function countTranslatableLines(jobs: ModPlan['jobs']): number {
  let total = 0
  for (const languageJobs of Object.values(jobs)) {
    for (const job of languageJobs ?? []) {
      for (const value of pendingValues(job)) if (isTranslatable(value)) total++
    }
  }
  return total
}

interface FileGroup {
  entry: LocalisationEntry
  keys: Map<string, string>
  known: Map<string, string>
  ownEntries: Map<string, LocalisationEntry>
}

export async function planMod(
  mod: ModFolder,
  options: KeyPlanOptions,
  fs: FsLike
): Promise<ModPlan> {
  const { gameDef, sourceLanguage, targetLanguages, packed, coverage, generated, memory, detail } =
    options
  const targetContent = options.targetContent ?? 'missing-keys'

  const descriptor = await readDescriptor(mod.path, fs)
  const name = descriptor.name ?? mod.id
  const plan: ModPlan = {
    name,
    namespace: getModNamespace(mod.id, name),
    ...(descriptor.supportedVersion !== undefined && {
      supportedVersion: descriptor.supportedVersion
    }),
    otherSpelling: false,
    localisationFiles: 0,
    sourceFiles: 0,
    sourceKeys: 0,
    jobs: {},
    covered: {},
    english: {},
    kept: {},
    shadowed: {},
    keyStates: [],
    errors: [],
    warnings: []
  }

  const modKeys = await readModKeys(mod.path, gameDef, fs)
  plan.otherSpelling = modKeys.otherSpelling
  const split = splitDiagnostics(modKeys.diagnostics)
  plan.errors = split.errors
  plan.warnings = split.warnings
  plan.localisationFiles = modKeys.files
  if (modKeys.files === 0) return plan

  const sourceEntries = modKeys.byLanguage.get(sourceLanguage)
  if (!sourceEntries || sourceEntries.size === 0) return plan
  plan.sourceFiles = new Set([...sourceEntries.values()].map(entry => entry.file)).size
  plan.sourceKeys = sourceEntries.size

  const sourceToken = gameDef.languageFileToken[sourceLanguage]
  if (sourceToken === undefined) return plan

  const existingFiles = new Set<string>()
  for (const entries of modKeys.byLanguage.values()) {
    for (const entry of entries.values()) existingFiles.add(pathKey(entry.file))
  }

  const generatedForMod = generated?.byNamespace.get(plan.namespace)

  for (const language of targetLanguages) {
    if (language === sourceLanguage) continue
    const targetToken = gameDef.languageFileToken[language]
    if (targetToken === undefined) continue

    const own = modKeys.byLanguage.get(language)
    const patched = coverage?.byLanguage.get(language)
    const ours = generatedForMod?.get(language)

    let covered = 0
    let english = 0
    let kept = 0
    let shadowed = 0

    const byFile = new Map<string, FileGroup>()

    const groupFor = (entry: LocalisationEntry): FileGroup => {
      let group = byFile.get(entry.file)
      if (!group) {
        group = { entry, keys: new Map(), known: new Map(), ownEntries: new Map() }
        byFile.set(entry.file, group)
      }
      return group
    }

    const record = (
      entry: LocalisationEntry,
      state: KeyState,
      provider?: string,
      shadowedByUs?: boolean
    ): void => {
      if (!detail) return
      const report: KeyReport = {
        modId: mod.id,
        modName: plan.name,
        language,
        key: entry.key,
        file: entry.file,
        source: entry.value,
        state,
        markupOnly: !isTranslatable(entry.value),
        ...(provider !== undefined && { provider }),
        ...(shadowedByUs !== undefined && { shadowed: shadowedByUs })
      }
      plan.keyStates.push(report)
    }

    for (const [key, entry] of sourceEntries) {
      const ownEntry = own?.get(key)
      const isPatched = patched?.has(key) ?? false
      const isOwn = ownEntry !== undefined
      if (isOwn || isPatched) {
        covered++
        const hidden = ours?.has(key) ?? false
        if (hidden) shadowed++
        record(
          entry,
          isOwn ? 'own' : 'patch',
          isOwn ? plan.name : coverage?.sources.join(', '),
          hidden
        )

        if (isPatched) continue
        if (targetContent === 'missing-keys') continue
        const group = groupFor(entry)
        group.keys.set(key, entry.value)
        if (ownEntry !== undefined) group.ownEntries.set(key, ownEntry)
        continue
      }

      const mine = ours?.get(key)

      const group = groupFor(entry)
      group.keys.set(key, entry.value)

      if (!mine) {
        record(entry, 'missing')
        continue
      }

      const verbatim = isUntranslated(mine.value, entry.value) && isTranslatable(entry.value)
      if (verbatim && memory?.get(language, entry.value) !== entry.value) {
        english++
        record(entry, 'english', mine.file)
        continue
      }

      covered++
      group.known.set(key, mine.value)
      if (verbatim) {
        kept++
        record(entry, 'kept', mine.file)
      } else {
        record(entry, 'generated', mine.file)
      }
    }

    plan.covered[language] = covered
    plan.english[language] = english
    plan.kept[language] = kept
    plan.shadowed[language] = shadowed

    const seen = new Set<string>()
    const languageJobs: CreationJob[] = []

    for (const { entry, keys, known, ownEntries } of byFile.values()) {
      let target = targetPathFor(entry.described, sourceToken, targetToken)
      if (pathKey(target) === pathKey(entry.file)) continue
      if (targetContent === 'missing-keys' && existingFiles.has(pathKey(target))) {
        target = withPartialSuffix(target)
      }
      const key = pathKey(target)
      if (seen.has(key)) continue
      seen.add(key)

      for (const [ownKey, ownEntry] of ownEntries) {
        if (pathKey(ownEntry.file) === key) {
          if (targetContent === 'complete-file') known.set(ownKey, ownEntry.value)
        } else {
          keys.delete(ownKey)
        }
      }

      if (targetContent !== 'missing-keys' && keys.size === known.size) continue

      languageJobs.push({
        source: entry.file,
        target,
        packed: packed ? getTranslationModPath(entry.described, target, sourceToken) : [],
        keys,
        known,
        content: targetContent
      })
    }

    if (languageJobs.length > 0) plan.jobs[language] = languageJobs
  }

  return plan
}

function targetPathFor(
  file: LocalisationFilePath,
  sourceToken: string,
  targetToken: string
): string {
  const normalized = file.path.replaceAll('\\', '/')
  const segments = posixSplit(normalized)
  const head = segments.slice(0, file.locIndex + 1)
  const tail = posixSplit(rewriteLanguageInPath(file.rest.join('/'), sourceToken, targetToken))
  return posixRejoin(normalized, [...head, ...tail])
}
