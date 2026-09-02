export interface Estimate {
  value: number
  unit: Intl.RelativeTimeFormatUnit
}

const SECONDS_CUTOFF = 90
const MINUTES_CUTOFF = 5400

const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600

export function estimateDuration(lines: number, linesPerSecond: number): Estimate {
  const seconds = Math.ceil(lines / Math.max(linesPerSecond, 1))
  if (seconds < SECONDS_CUTOFF) return { value: seconds, unit: 'second' }
  if (seconds < MINUTES_CUTOFF) {
    return { value: Math.round(seconds / SECONDS_PER_MINUTE), unit: 'minute' }
  }
  return { value: Math.round(seconds / SECONDS_PER_HOUR), unit: 'hour' }
}
