import type { JobEvent, ProgressPort } from '@ptt/converter-core'

import { clearTicker, dim, ticker } from './output.js'

/**
 * The progress port, rendered as a terminal ticker.
 *
 * Ported from PR #4 (e21ee7a, `src/cli/index.ts` `consolePort`) by Artem Kondrashev. Its whole point
 * is that the CLI and the desktop worker consume the *same* contract, so the two cannot drift into
 * doing different things. The original typed it `any` with three eslint-disables; it is now the
 * `ProgressPort` interface that converter-core owns (audit finding Q-3).
 */

export interface ConsolePort extends ProgressPort {
  /** Wipe the in-place line before printing anything else. */
  done(): void
}

export function consolePort(): ConsolePort {
  const tick = ticker()
  let counters = ''

  return {
    emit(event: JobEvent): void {
      switch (event.type) {
        case 'mod-progress':
          tick(`  ${event.processed}/${event.total}  ${event.modName}${counters}`)
          break
        case 'translate-progress':
          counters =
            `  ${event.counters.translated} translated, ` +
            `${event.counters.cached} cached, ${event.counters.failed} refused`
          break
        case 'scan-progress':
          tick(`  scanning ${event.processed}/${event.total}`)
          break
        case 'apply-progress':
          tick(`  writing ${event.processed}/${event.total}`)
          break
        case 'log':
          clearTicker()
          console.error(dim(`  · ${event.message}`))
          break
        default:
          // The terminal cares about progress; the terminal states are printed by the command
          // itself, which has the whole result in hand.
          break
      }
    },
    done(): void {
      clearTicker()
    }
  }
}
