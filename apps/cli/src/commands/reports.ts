import { posixDirname, posixJoin } from '@ptt/converter-core'
import { nodeFs } from '@ptt/fs-node'
import { StoredRunReportSchema, writeKeyCsv } from '@ptt/report-core'
import type { ParsedRunReport } from '@ptt/report-core'

import type { Args } from '../args.js'
import type { CliOptions } from '../options.js'
import { dim, facts, num, section, table } from '../output.js'

/**
 * What earlier runs wrote.
 *
 * Ported from PR #4 (e21ee7a, `src/cli/index.ts` `commandReports`) by Artem Kondrashev, with two
 * fixes: the report goes through `StoredRunReportSchema` instead of `JSON.parse` plus an assertion
 * (audit finding Q-7), and `--json` / `--csv` are honoured, which the original silently ignored.
 */

const BYTES_PER_KB = 1024

export async function commandReports(options: CliOptions, args: Args): Promise<void> {
  section(`Run reports  ${dim(options.reportsDir)}`)

  const files = await listReports(options.reportsDir)
  if (files.length === 0) {
    console.log(dim('  no report yet, run convert first'))
    return
  }

  const chosen = args.flags.last ? files[files.length - 1] : undefined
  if (chosen === undefined) {
    table(
      [{ header: 'report' }, { header: 'size', right: true }],
      await Promise.all(
        files.slice(-options.limit).map(async file => {
          const stat = await nodeFs.stat(posixJoin(options.reportsDir, file))
          return [file, `${(stat.size / BYTES_PER_KB).toFixed(0)} KB`]
        })
      )
    )
    console.log(dim('\n  Add --last to summarise the newest one.'))
    return
  }

  const report = await readReport(posixJoin(options.reportsDir, chosen))
  section(chosen)
  facts([
    ['started', report.startedAt],
    ['seconds', report.seconds],
    ['path', report.request.path],
    ['mode', report.request.mode],
    ['provider', report.request.translate?.provider ?? dim('none')],
    ['files created', report.totals.created],
    ['strings translated', report.counters?.translated ?? 0],
    ['strings from memory', report.counters?.cached ?? 0],
    ['strings refused', report.counters?.failed ?? 0],
    ['keys left in the source language', report.untranslated.length]
  ])

  const reasons = Object.entries(report.refusalsByReason)
  if (reasons.length > 0) {
    section('Why strings were refused')
    table(
      [{ header: 'reason' }, { header: 'strings', right: true }],
      reasons.toSorted((a, b) => b[1] - a[1]).map(([reason, count]) => [reason, num(count)])
    )
  }

  section(
    `Keys left in the source language (showing ${Math.min(report.untranslated.length, options.limit)})`
  )
  table(
    [
      { header: 'mod', max: 26 },
      { header: 'key', max: 36 },
      { header: 'reason', max: 40 },
      { header: 'source value', max: 50 }
    ],
    report.untranslated
      .slice(0, options.limit)
      .map(key => [key.modName, key.key, key.reason ?? '', key.source.replace(/\s+/g, ' ')])
  )

  await writeOutputs(options, report)
}

async function listReports(directory: string): Promise<string[]> {
  try {
    const entries = await nodeFs.readdir(directory)
    return entries
      .filter(entry => entry.isFile && entry.name.endsWith('.json'))
      .map(entry => entry.name)
      .toSorted()
  } catch {
    return []
  }
}

/**
 * Read a report back, validated.
 *
 * A file is a process boundary: a hand-edited or truncated report used to crash somewhere far from
 * where it was read.
 */
async function readReport(path: string): Promise<ParsedRunReport> {
  const raw = await nodeFs.readFile(path, 'utf-8')
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (err) {
    throw new Error(
      `${path} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`,
      { cause: err }
    )
  }
  const validated = StoredRunReportSchema.safeParse(parsed)
  if (!validated.success) {
    const first = validated.error.issues[0]
    const where = first ? `${first.path.join('.')}: ${first.message}` : 'unknown field'
    throw new Error(`${path} is not a run report this build understands (${where})`)
  }
  return validated.data
}

/** `--json` and `--csv`, which the original accepted and then ignored. */
async function writeOutputs(options: CliOptions, report: ParsedRunReport): Promise<void> {
  if (options.jsonOut !== undefined) {
    const dir = posixDirname(options.jsonOut)
    if (dir.length > 0) await nodeFs.mkdir(dir, { recursive: true })
    await nodeFs.writeFile(options.jsonOut, `${JSON.stringify(report, null, 2)}\n`, 'utf-8')
    console.log(dim(`\n  json → ${options.jsonOut}`))
  }
  if (options.csvOut !== undefined) {
    const written = await writeKeyCsv(options.csvOut, report.untranslated, nodeFs)
    console.log(dim(`  csv  → ${options.csvOut} (${num(written.rows)} rows)`))
  }
}
