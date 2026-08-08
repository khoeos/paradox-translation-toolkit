/**
 * How long a translation run will roughly take.
 *
 * Ported from PR #4 (e21ee7a) by Artem Kondrashev, who described the per-provider rates as orders
 * of magnitude himself. This is here to tell minutes from hours, not to promise a finish time, so
 * it picks the largest unit that still reads as a small number.
 */
export interface Estimate {
  value: number
  unit: Intl.RelativeTimeFormatUnit
}

/** Above this many seconds, minutes read better than seconds. */
const SECONDS_CUTOFF = 90
/** Above this many seconds, hours read better than minutes. */
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
