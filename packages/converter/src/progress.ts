import type { ApplyReport, ConversionOutput, ScanOutput, ScanResult } from './types.js'

/**
 * The progress protocol of a run, owned in one place.
 *
 * It used to be declared twice, byte for byte, in `main/services/converter-service.ts` and
 * `renderer/src/store/jobs.ts`, with a guard that only checked that `type` was a string: a
 * variant added on one side fell through the other's `switch` in silence. Audit findings Q-3
 * and Q-6.
 */

/** What a translator did, as seen from here. The engine itself lives in another package. */
export interface TranslationProgress {
  translated: number
  cached: number
  failed: number
}

/** Every event type, as a tuple, so the guard and the tests can enumerate them. */
export const JOB_EVENT_TYPES = [
  'scan-progress',
  'apply-progress',
  'scan-done',
  'plan-ready',
  'done',
  'error',
  'log',
  'mod-progress',
  'mods-scanned',
  'translate-progress',
  'convert-done',
  'cancelled'
] as const

export type JobEventType = (typeof JOB_EVENT_TYPES)[number]

export type JobEvent =
  /* File-level pipeline. */
  | { type: 'scan-progress'; jobId: string; processed: number; total: number }
  | { type: 'apply-progress'; jobId: string; processed: number; total: number }
  | { type: 'scan-done'; jobId: string; result: ScanResult }
  | {
      type: 'plan-ready'
      jobId: string
      scannedCount: number
      sourceCount: number
      missingCount: number
    }
  | { type: 'done'; jobId: string; report: ApplyReport }
  | { type: 'error'; jobId: string; message: string }
  /** A line for the run log, already interpolated. */
  | { type: 'log'; jobId: string; message: string }
  /* Mod-level pipeline. */
  | {
      type: 'mod-progress'
      jobId: string
      processed: number
      total: number
      modName: string
    }
  | { type: 'mods-scanned'; jobId: string; output: ScanOutput }
  | { type: 'translate-progress'; jobId: string; counters: TranslationProgress }
  | { type: 'convert-done'; jobId: string; output: ConversionOutput }
  /** The user asked to stop and the run stopped cleanly, leaving no half-written file. */
  | { type: 'cancelled'; jobId: string }

const KNOWN_TYPES = new Set<string>(JOB_EVENT_TYPES)

/**
 * Whether a value crossing a process boundary is a job event.
 *
 * The type is checked against the known set rather than merely for being a string, so a variant
 * one side emits and the other does not handle is caught here instead of vanishing.
 * @param value - The raw message
 * @returns True when the message is a job event this build knows
 */
export function isJobEvent(value: unknown): value is JobEvent {
  if (typeof value !== 'object' || value === null) return false
  if (!('type' in value) || !('jobId' in value)) return false
  return (
    typeof value.type === 'string' && KNOWN_TYPES.has(value.type) && typeof value.jobId === 'string'
  )
}

/**
 * A sink for run progress.
 *
 * The desktop worker posts to a `MessagePort`, the CLI renders a terminal ticker, and both are
 * this. Audit finding Q-3: the original typed it `any` with three eslint-disables, which is what
 * let the UI and the CLI drift apart.
 */
export interface ProgressPort {
  emit(event: JobEvent): void
}
