import type { DiagnosticSeverity } from './diagnostics.js'
import type { ConversionOutput, ScanOutput } from './types.js'

export type { DiagnosticSeverity } from './diagnostics.js'

export interface TranslationProgress {
  translated: number
  cached: number
  failed: number
}

export const JOB_EVENT_TYPES = [
  'error',
  'log',
  'mod-progress',
  'scan-phase',
  'mods-scanned',
  'translate-progress',
  'convert-done',
  'cancelled'
] as const

export type JobEventType = (typeof JOB_EVENT_TYPES)[number]

export const SCAN_PHASES = [
  'reading-generated',
  'discovering',
  'building-coverage',
  'planning'
] as const

export type ScanPhase = (typeof SCAN_PHASES)[number]

export interface ScanRunningTotals {
  files: number
  missingFiles: number
  missingLines: number
  withoutLocalisation: number
  otherSpelling: number
  errors: number
  warnings: number
}

export type JobEvent =
  | { type: 'error'; jobId: string; message: string }
  | { type: 'log'; jobId: string; message: string; severity?: DiagnosticSeverity }
  | {
      type: 'mod-progress'
      jobId: string
      processed: number
      total: number
      modName: string
      totals?: ScanRunningTotals
    }
  | { type: 'scan-phase'; jobId: string; phase: ScanPhase; done?: number; total?: number }
  | { type: 'mods-scanned'; jobId: string; output: ScanOutput }
  | { type: 'translate-progress'; jobId: string; counters: TranslationProgress }
  | { type: 'convert-done'; jobId: string; output: ConversionOutput }
  | { type: 'cancelled'; jobId: string }

const KNOWN_TYPES = new Set<string>(JOB_EVENT_TYPES)

export function isJobEvent(value: unknown): value is JobEvent {
  if (typeof value !== 'object' || value === null) return false
  if (!('type' in value) || !('jobId' in value)) return false
  return (
    typeof value.type === 'string' && KNOWN_TYPES.has(value.type) && typeof value.jobId === 'string'
  )
}

export interface ProgressPort {
  emit(event: JobEvent): void
}
