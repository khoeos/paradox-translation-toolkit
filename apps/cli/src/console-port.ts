import type { DiagnosticSeverity, JobEvent, ProgressPort, ScanPhase } from '@ptt/converter'

import { clearTicker, dim, red, ticker, yellow } from './output.js'
import { createTranslationStatus } from './translation-status.js'

export interface ConsolePort extends ProgressPort {
  done(): void
}

const PHASE_LABELS: Record<ScanPhase, string> = {
  'reading-generated': 'reading the generated mod',
  discovering: 'discovering mods',
  'building-coverage': 'reading localisation',
  planning: 'planning'
}

const COUNTDOWN_MS = 1000

const LOG_MARKS: Record<DiagnosticSeverity | 'none', string> = {
  none: dim('  ·'),
  warning: yellow('  !'),
  error: red('  ×')
}

export function consolePort(): ConsolePort {
  const tick = ticker()
  const translation = createTranslationStatus()
  let counters = ''
  let countdown: ReturnType<typeof setInterval> | undefined

  const showTranslation = (): void => {
    const line = translation.line(Date.now())
    if (line !== undefined) tick.show(line)
  }

  const stopCountdown = (): void => {
    if (countdown !== undefined) clearInterval(countdown)
    countdown = undefined
  }

  return {
    emit(event: JobEvent): void {
      if (translation.apply(event, Date.now())) showTranslation()
      if (event.type === 'translate-wait') {
        if (event.resumesAt === null) stopCountdown()
        else if (countdown === undefined) {
          countdown = setInterval(showTranslation, COUNTDOWN_MS)
          countdown.unref()
        }
      }

      switch (event.type) {
        case 'scan-phase': {
          if (event.phase === 'planning' && event.done !== undefined) break
          const count = event.total === undefined ? '' : `  ${event.done ?? 0}/${event.total}`
          tick.show(`  ${PHASE_LABELS[event.phase]}${count}`)
          break
        }
        case 'mod-progress': {
          const line = translation.line(Date.now())
          tick.show(line ?? `  ${event.processed}/${event.total}  ${event.modName}${counters}`)
          break
        }
        case 'translate-progress':
          counters =
            `  ${event.counters.translated} translated, ` +
            `${event.counters.cached} cached, ${event.counters.failed} refused`
          break
        case 'log':
          clearTicker()
          console.error(`${LOG_MARKS[event.severity ?? 'none']} ${dim(event.message)}`)
          break
        default:
          break
      }
    },
    done(): void {
      stopCountdown()
      tick.stop()
      clearTicker()
    }
  }
}
