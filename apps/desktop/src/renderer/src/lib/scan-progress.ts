import type { ScanPhase } from '@ptt/converter/progress'

const PHASE_BANDS: Record<ScanPhase, readonly [start: number, end: number]> = {
  'reading-generated': [2, 8],
  discovering: [8, 15],
  'building-coverage': [15, 55],
  planning: [55, 100]
}

export const scanPhasePercent = (
  phase: ScanPhase,
  done: number | null,
  total: number | null
): number => {
  const [start, end] = PHASE_BANDS[phase]
  if (done === null || total === null || total <= 0) return start
  const ratio = Math.min(Math.max(done / total, 0), 1)
  return start + (end - start) * ratio
}

const MS_PER_SECOND = 1000
const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600

const pad = (value: number): string => String(value).padStart(2, '0')

export const formatElapsed = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / MS_PER_SECOND))
  const seconds = totalSeconds % SECONDS_PER_MINUTE
  const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR)
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE) % SECONDS_PER_MINUTE
  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`
  return `${minutes}:${pad(seconds)}`
}
