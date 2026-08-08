import type { KeyReport, KeyState } from '@ptt/converter-core'

import type { Args } from '../args.js'
import { filterMods } from '../filter.js'
import type { CliOptions } from '../options.js'
import { dim, green, num, red, section, table, yellow } from '../output.js'
import { printHeader, printScanTotals, runScan, writeOutputs } from './shared.js'

/**
 * The state of every key, and the list of the ones still in the source language.
 *
 * Ported from PR #4 (e21ee7a, `src/cli/index.ts` `commandAudit`) by Artem Kondrashev. This is the
 * reason the CLI exists: it says which strings are still untranslated and why, mod by mod and key
 * by key, which no amount of staring at a progress bar can.
 */

/** Order the audit prints its state summary in, from best to worst. */
const STATE_ORDER: readonly KeyState[] = ['own', 'patch', 'generated', 'kept', 'english', 'missing']

const STATE_LABEL: Record<KeyState, string> = {
  own: 'translated by the mod itself',
  patch: 'translated by a localisation mod',
  generated: 'translated by us',
  kept: 'the backend answered with the source text, mostly proper names',
  // A hyphen, not an em dash: the repo forbids the character.
  english: 'left in the source language by us - refused',
  missing: 'never generated'
}

const PERCENT_DECIMALS = 1

export async function commandAudit(options: CliOptions, args: Args): Promise<void> {
  printHeader(options)
  const output = await runScan(options, true)

  const keyStates = filterMods(output.keyStates ?? [], options.modFilter, key => [
    key.modId,
    key.modName
  ])

  printScanTotals(output)

  section('Every key of the collection')
  const counts = new Map<KeyState, number>()
  for (const key of keyStates) counts.set(key.state, (counts.get(key.state) ?? 0) + 1)
  const grand = keyStates.length || 1

  table(
    [
      { header: 'state' },
      { header: 'keys', right: true },
      { header: 'share', right: true },
      { header: 'meaning' }
    ],
    STATE_ORDER.map(state => {
      const value = counts.get(state) ?? 0
      return [
        colourFor(state)(state),
        num(value),
        `${((value / grand) * 100).toFixed(PERCENT_DECIMALS)}%`,
        dim(STATE_LABEL[state])
      ]
    })
  )

  const wanted = String(args.flags.state ?? 'english').toLowerCase()
  if (wanted !== 'all' && !STATE_ORDER.some(state => state === wanted)) {
    throw new Error(`Unknown --state "${wanted}", expected all or one of ${STATE_ORDER.join(', ')}`)
  }
  const selected = wanted === 'all' ? keyStates : keyStates.filter(key => key.state === wanted)

  section(
    `Keys in state ${wanted} (${selected.length}, showing ${Math.min(selected.length, options.limit)})`
  )
  table(
    [
      { header: 'mod', max: 28 },
      { header: 'key', max: 40 },
      { header: 'source value', max: 64 },
      { header: 'note' }
    ],
    selected
      .slice(0, options.limit)
      .map(key => [key.modName, key.key, key.source.replace(/\s+/g, ' '), noteFor(key)])
  )

  // Which mods hold the refusals is what decides where to spend a retry.
  const worst = new Map<string, number>()
  for (const key of keyStates) {
    if (key.state !== 'english') continue
    worst.set(key.modName, (worst.get(key.modName) ?? 0) + 1)
  }
  if (worst.size > 0) {
    section('Refusals by mod')
    table(
      [
        { header: 'mod', max: 50 },
        { header: 'keys left untranslated', right: true }
      ],
      [...worst.entries()]
        .toSorted((a, b) => b[1] - a[1])
        .slice(0, options.limit)
        .map(([name, count]) => [name, red(num(count))])
    )
  }

  console.log(
    dim(
      '\n  A key counts as refused when our generated file repeats the source text word for word.' +
        '\n  Values made only of markup or numbers are never sent to a translator and are not counted.'
    )
  )

  await writeOutputs(options, output, selected)
}

function colourFor(state: KeyState): (text: string) => string {
  if (state === 'english') return red
  if (state === 'missing') return yellow
  if (state === 'kept') return dim
  return green
}

function noteFor(key: KeyReport): string {
  if (key.shadowed === true) return yellow('shadowed by us')
  if (key.markupOnly === true) return dim('markup only')
  return key.reason ?? ''
}
