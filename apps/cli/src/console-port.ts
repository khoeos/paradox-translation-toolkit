import type { DiagnosticSeverity, JobEvent, ProgressPort, ScanPhase } from '@ptt/converter'

import { clearTicker, dim, red, ticker, yellow } from './output.js'

export interface ConsolePort extends ProgressPort {
  done(): void
}

const PHASE_LABELS: Record<ScanPhase, string> = {
  'reading-generated': 'reading the generated mod',
  discovering: 'discovering mods',
  'building-coverage': 'reading localisation',
  planning: 'planning'
}

const LOG_MARKS: Record<DiagnosticSeverity | 'none', string> = {
  none: dim('  ·'),
  warning: yellow('  !'),
  error: red('  ×')
}

export function consolePort(): ConsolePort {
  const tick = ticker()
  let counters = ''

  return {
    emit(event: JobEvent): void {
      switch (event.type) {
        case 'scan-phase': {
          if (event.phase === 'planning' && event.done !== undefined) break
          const count = event.total === undefined ? '' : `  ${event.done ?? 0}/${event.total}`
          tick(`  ${PHASE_LABELS[event.phase]}${count}`)
          break
        }
        case 'mod-progress':
          tick(`  ${event.processed}/${event.total}  ${event.modName}${counters}`)
          break
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
      clearTicker()
    }
  }
}
