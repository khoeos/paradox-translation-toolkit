import { EMPTY_ESTIMATES, applyEstimateEvent, buildEstimateView } from '@ptt/converter'
import type { DurationParts, EtaDisplay, JobEvent } from '@ptt/converter'

import { num } from './output.js'

export interface TranslationStatus {
  apply(event: JobEvent, now: number): boolean
  line(now: number): string | undefined
}

export const formatDuration = ({ hours, minutes }: DurationParts): string => {
  if (hours === 0) return `${minutes} min`
  if (minutes === 0) return `${hours} h`
  return `${hours} h ${minutes} min`
}

export const formatEta = (display: EtaDisplay): string => {
  switch (display.kind) {
    case 'estimating':
      return 'estimating time left'
    case 'under-a-minute':
      return 'under a minute left'
    case 'about':
      return `about ${formatDuration(display.duration)} left`
    case 'range':
      return `${formatDuration(display.low)} to ${formatDuration(display.high)} left`
    case 'at-least':
      return `more than ${formatDuration(display.duration)} left`
  }
}

export const createTranslationStatus = (): TranslationStatus => {
  let state = EMPTY_ESTIMATES

  return {
    apply(event, now) {
      const next = applyEstimateEvent(state, event, now)
      const changed = next !== state
      state = next
      return changed
    },

    line(now) {
      if (state.counting) {
        return `  counting the texts to translate  ${state.counting.done}/${state.counting.total} mods`
      }
      const view = buildEstimateView(state, now)
      if (!view) return undefined

      const parts = [`run ${num(view.run.done)}/${num(view.run.total)}, ${formatEta(view.run.eta)}`]
      if (view.waitSeconds !== null) {
        parts.push(`rate limited, retrying in ${view.waitSeconds} s`)
      }
      for (const mod of view.mods) {
        parts.push(
          `${mod.modName} (${mod.language}) ${num(mod.done)}/${num(mod.total)}, ${formatEta(mod.eta)}`
        )
      }
      return `  ${parts.join('  ·  ')}`
    }
  }
}
