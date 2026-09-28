import type { DurationParts, EtaDisplay } from '@ptt/converter/eta'

import type { Translate } from '@renderer/lib/targets'

const FULL = 100

export const formatDuration = (t: Translate, { hours, minutes }: DurationParts): string => {
  if (hours === 0) return t('modal.eta.minutes', { minutes })
  if (minutes === 0) return t('modal.eta.hours', { hours })
  return t('modal.eta.hoursMinutes', { hours, minutes })
}

export const formatEta = (t: Translate, display: EtaDisplay): string => {
  switch (display.kind) {
    case 'estimating':
      return t('modal.eta.estimating', {})
    case 'under-a-minute':
      return t('modal.eta.underAMinute', {})
    case 'about':
      return t('modal.eta.about', { duration: formatDuration(t, display.duration) })
    case 'range':
      return t('modal.eta.range', {
        low: formatDuration(t, display.low),
        high: formatDuration(t, display.high)
      })
    case 'at-least':
      return t('modal.eta.atLeast', { duration: formatDuration(t, display.duration) })
  }
}

export const settledPercent = (done: number, total: number): number => {
  if (total <= 0) return FULL
  return (Math.min(Math.max(done, 0), total) / total) * FULL
}
