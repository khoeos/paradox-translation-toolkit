import type { JobEvent } from './progress.js'

export interface ProgressSample {
  at: number
  done: number
}

export interface Throughput {
  first: ProgressSample
  recent: readonly ProgressSample[]
}

export interface EtaRange {
  low: number
  high?: number
}

export interface DurationParts {
  hours: number
  minutes: number
}

export type EtaDisplay =
  | { kind: 'estimating' }
  | { kind: 'under-a-minute' }
  | { kind: 'about'; duration: DurationParts }
  | { kind: 'range'; low: DurationParts; high: DurationParts }
  | { kind: 'at-least'; duration: DurationParts }

export interface WorkloadCounting {
  done: number
  total: number
}

export interface RunEstimate {
  total: number
  done: number
  throughput: Throughput
}

export interface ModEstimate {
  modId: string
  modName: string
  language: string
  pending: number
  done: number
  throughput: Throughput
}

export interface EstimateState {
  counting: WorkloadCounting | null
  run: RunEstimate | null
  mods: readonly ModEstimate[]
  resumesAt: number | null
}

export interface EstimateLine {
  done: number
  total: number
  eta: EtaDisplay
}

export interface ModEstimateLine extends EstimateLine {
  modId: string
  modName: string
  language: string
}

export interface EstimateView {
  run: EstimateLine
  mods: ModEstimateLine[]
  waitSeconds: number | null
}

export const EMPTY_ESTIMATES: EstimateState = {
  counting: null,
  run: null,
  mods: [],
  resumesAt: null
}

const MS_PER_SECOND = 1000
const MINUTE_MS = 60_000
const MINUTES_PER_HOUR = 60

const RECENT_WINDOW_MS = 3 * MINUTE_MS
const MIN_ELAPSED_MS = 10_000
const LOW_MARGIN = 0.9
const HIGH_MARGIN = 1.25

const ROUNDING_STEPS: ReadonlyArray<readonly [below: number, step: number]> = [
  [10 * MINUTE_MS, MINUTE_MS],
  [MINUTES_PER_HOUR * MINUTE_MS, 5 * MINUTE_MS],
  [3 * MINUTES_PER_HOUR * MINUTE_MS, 15 * MINUTE_MS]
]
const LONG_STEP_MS = 30 * MINUTE_MS

export const startThroughput = (at: number, done = 0): Throughput => {
  const sample = { at, done }
  return { first: sample, recent: [sample] }
}

export const recordProgress = (throughput: Throughput, sample: ProgressSample): Throughput => {
  const cutoff = sample.at - RECENT_WINDOW_MS
  const anchor = throughput.recent.findLast(kept => kept.at < cutoff)
  const inWindow = throughput.recent.filter(kept => kept.at >= cutoff)
  return {
    first: throughput.first,
    recent: [...(anchor === undefined ? [] : [anchor]), ...inWindow, sample]
  }
}

export const estimateRemaining = (
  throughput: Throughput,
  remaining: number,
  now: number,
  resumesAt?: number
): EtaRange | undefined => {
  if (remaining <= 0) return { low: 0, high: 0 }

  const { first } = throughput
  const last = throughput.recent.at(-1) ?? first
  const elapsed = now - first.at
  const done = last.done - first.done
  if (elapsed < MIN_ELAPSED_MS || done <= 0) return undefined

  const overall = done / elapsed
  const windowStart = now - RECENT_WINDOW_MS
  const anchor =
    throughput.recent.findLast(sample => sample.at <= windowStart) ?? throughput.recent[0] ?? first
  const windowElapsed = now - anchor.at
  const recent =
    windowElapsed >= MIN_ELAPSED_MS ? (last.done - anchor.done) / windowElapsed : overall

  const wait = resumesAt === undefined ? 0 : Math.max(0, resumesAt - now)
  const low = Math.max((remaining / Math.max(overall, recent)) * LOW_MARGIN, wait)
  const slowest = Math.min(overall, recent)
  if (slowest <= 0) return { low }
  return { low, high: Math.max((remaining / slowest) * HIGH_MARGIN, low) }
}

export const capEta = (
  range: EtaRange | undefined,
  ceiling: EtaRange | undefined
): EtaRange | undefined => {
  if (range === undefined || ceiling?.high === undefined) return range
  const high = Math.min(range.high ?? ceiling.high, ceiling.high)
  return { low: Math.min(range.low, high), high }
}

export const roundDuration = (ms: number): number => {
  const step = ROUNDING_STEPS.find(([below]) => ms < below)?.[1] ?? LONG_STEP_MS
  return Math.round(ms / step) * step
}

export const splitDuration = (ms: number): DurationParts => {
  const minutes = Math.round(ms / MINUTE_MS)
  return { hours: Math.floor(minutes / MINUTES_PER_HOUR), minutes: minutes % MINUTES_PER_HOUR }
}

export const describeEta = (range: EtaRange | undefined): EtaDisplay => {
  if (range === undefined) return { kind: 'estimating' }

  const low = Math.max(MINUTE_MS, roundDuration(range.low))
  if (range.high === undefined) return { kind: 'at-least', duration: splitDuration(low) }

  if (range.high < MINUTE_MS) return { kind: 'under-a-minute' }
  const high = Math.max(MINUTE_MS, roundDuration(range.high))
  if (low >= high) return { kind: 'about', duration: splitDuration(high) }
  return { kind: 'range', low: splitDuration(low), high: splitDuration(high) }
}

export const applyEstimateEvent = (
  state: EstimateState,
  event: JobEvent,
  now: number
): EstimateState => {
  switch (event.type) {
    case 'translate-counting':
      return { ...state, counting: { done: event.done, total: event.total } }
    case 'translate-workload':
      return {
        ...state,
        counting: null,
        run:
          event.total > 0 ? { total: event.total, done: 0, throughput: startThroughput(now) } : null
      }
    case 'translate-mod':
      return {
        ...state,
        mods: [
          ...state.mods.filter(mod => mod.modId !== event.modId),
          {
            modId: event.modId,
            modName: event.modName,
            language: event.language,
            pending: event.pending,
            done: 0,
            throughput: startThroughput(now)
          }
        ]
      }
    case 'translate-mod-progress': {
      const mods = event.finished
        ? state.mods.filter(mod => mod.modId !== event.modId)
        : state.mods.map(mod =>
            mod.modId === event.modId
              ? {
                  ...mod,
                  done: event.done,
                  throughput: recordProgress(mod.throughput, { at: now, done: event.done })
                }
              : mod
          )
      const run = state.run && {
        ...state.run,
        done: event.runDone,
        throughput: recordProgress(state.run.throughput, { at: now, done: event.runDone })
      }
      return { ...state, mods, run }
    }
    case 'translate-wait':
      return { ...state, resumesAt: event.resumesAt }
    default:
      return state
  }
}

export const buildEstimateView = (state: EstimateState, now: number): EstimateView | undefined => {
  const { run, resumesAt } = state
  if (!run) return undefined

  const wait = resumesAt ?? undefined
  const runRange = estimateRemaining(run.throughput, Math.max(0, run.total - run.done), now, wait)
  return {
    run: { done: Math.min(run.done, run.total), total: run.total, eta: describeEta(runRange) },
    mods: state.mods.map(mod => ({
      modId: mod.modId,
      modName: mod.modName,
      language: mod.language,
      done: Math.min(mod.done, mod.pending),
      total: mod.pending,
      eta: describeEta(
        capEta(
          estimateRemaining(mod.throughput, Math.max(0, mod.pending - mod.done), now, wait),
          runRange
        )
      )
    })),
    waitSeconds:
      resumesAt === null || resumesAt <= now ? null : Math.ceil((resumesAt - now) / MS_PER_SECOND)
  }
}
