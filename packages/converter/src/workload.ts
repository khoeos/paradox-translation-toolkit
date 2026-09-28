import { isTranslatable } from '@ptt/parser'

import { mapWithConcurrency } from './concurrency.js'
import { MOD_CONCURRENCY } from './constants.js'
import { pendingValues } from './key-plan.js'
import type { CreationJob, ModFolder, ModPlan, TranslationEnginePort } from './types.js'

type CacheCheck = Pick<TranslationEnginePort, 'isCached'>

export const translatableValues = (jobs: readonly CreationJob[]): string[] =>
  jobs.flatMap(job => pendingValues(job).filter(value => isTranslatable(value)))

export const backendValues = (
  values: ReadonlySet<string>,
  language: string,
  engine: CacheCheck
): string[] => [...values].filter(value => !engine.isCached(language, value))

export interface WorkloadOptions {
  mods: readonly ModFolder[]
  sourceLanguage: string
  engine: CacheCheck
  plan: (mod: ModFolder) => Promise<ModPlan>
  isCancelled: () => boolean
  onMod: (done: number) => void
}

export interface Workload {
  total: number
  unclaimed: Map<string, Set<string>>
}

export const countTranslationWorkload = async (options: WorkloadOptions): Promise<Workload> => {
  const { mods, sourceLanguage, engine, plan, isCancelled, onMod } = options
  const unclaimed = new Map<string, Set<string>>()
  let done = 0

  onMod(done)
  await mapWithConcurrency(mods, MOD_CONCURRENCY, async mod => {
    if (isCancelled()) return
    const { jobs } = await plan(mod)
    for (const [language, languageJobs] of Object.entries(jobs)) {
      if (language === sourceLanguage || !languageJobs) continue
      let values = unclaimed.get(language)
      if (!values) {
        values = new Set()
        unclaimed.set(language, values)
      }
      for (const value of backendValues(
        new Set(translatableValues(languageJobs)),
        language,
        engine
      )) {
        values.add(value)
      }
    }
    onMod(++done)
  })

  let total = 0
  for (const values of unclaimed.values()) total += values.size
  return { total, unclaimed }
}

export interface WorkloadTracker {
  claim(slot: string, language: string, values: readonly string[]): void
  settle(slot: string, done: number): number
}

export const createWorkloadTracker = (unclaimed: Map<string, Set<string>>): WorkloadTracker => {
  const claimed = new Map<string, number>()
  const settled = new Map<string, number>()
  let done = 0

  return {
    claim(slot, language, values) {
      const open = unclaimed.get(language)
      let count = 0
      for (const value of values) if (open?.delete(value)) count++
      claimed.set(slot, count)
    },
    settle(slot, slotDone) {
      const share = Math.min(Math.max(slotDone, 0), claimed.get(slot) ?? 0)
      done += share - (settled.get(slot) ?? 0)
      settled.set(slot, share)
      return done
    }
  }
}
