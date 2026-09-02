import type { KeyReport, KeyState } from '@ptt/converter'

import type { Args } from '../args.js'
import { filterMods } from '../filter.js'
import type { CliOptions } from '../options.js'
import { dim, green, num, red, section, table, yellow } from '../output.js'
import { printHeader, printScanTotals, runScan, writeOutputs } from './shared.js'

export const STATE_ORDER: readonly KeyState[] = [
  'own',
  'patch',
  'generated',
  'kept',
  'english',
  'missing'
]

export const STATE_LABEL: Record<KeyState, string> = {
  own: 'translated by the mod itself',
  patch: 'translated by a localisation mod',
  generated: 'translated by us',
  kept: 'the backend answered with the source text, mostly proper names',
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
        STATE_COLOUR[state](state),
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

  printByMod(keyStates, 'english', 'Refusals by mod', options.limit)

  console.log(
    dim(
      '\n  A key counts as refused when our generated file repeats the source text word for word.' +
        "\n  It counts as a copy when the mod's own target file does, which is all v2 of this tool" +
        '\n  ever wrote. Values made only of markup or numbers are never sent to a translator' +
        '\n  and are counted as neither.'
    )
  )

  await writeOutputs(options, output, selected)
}

const STATE_COLOUR: Record<KeyState, (text: string) => string> = {
  own: green,
  patch: green,
  generated: green,
  kept: dim,
  english: red,
  missing: yellow
}

function printByMod(
  keyStates: readonly KeyReport[],
  state: KeyState,
  title: string,
  limit: number
): void {
  const worst = new Map<string, number>()
  for (const key of keyStates) {
    if (key.state !== state) continue
    worst.set(key.modName, (worst.get(key.modName) ?? 0) + 1)
  }
  if (worst.size === 0) return
  section(title)
  table(
    [
      { header: 'mod', max: 50 },
      { header: 'keys left untranslated', right: true }
    ],
    [...worst.entries()]
      .toSorted((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => [name, red(num(count))])
  )
}

function noteFor(key: KeyReport): string {
  if (key.shadowed === true) return yellow('shadowed by us')
  if (key.markupOnly === true) return dim('markup only')
  return key.reason ?? ''
}
