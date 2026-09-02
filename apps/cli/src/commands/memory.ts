import { posixJoin } from '@ptt/converter'
import { nodeFs } from '@ptt/fs-node'
import { clearMemoryFiles } from '@ptt/translate'

import type { Args } from '../args.js'
import type { CliOptions } from '../options.js'
import { dim, green, num, section, table } from '../output.js'

const BYTES_PER_MB = 1024 * 1024

export async function commandMemory(options: CliOptions, args: Args): Promise<void> {
  const root = posixJoin(options.userDataPath, 'translation-memory')

  if (args.flags.clear) {
    const removed = await clearMemoryFiles(root, nodeFs)
    console.log(green(`  cleared ${num(removed)} memory files under ${root}`))
    return
  }

  section(`Translation memory  ${dim(root)}`)
  const rows = await collect(root, [])
  if (rows.length === 0) {
    console.log(dim('  nothing remembered yet'))
    return
  }

  table(
    [
      { header: 'scope', max: 48 },
      { header: 'strings', right: true },
      { header: 'size', right: true }
    ],
    rows
  )
  console.log(dim('\n  Clear it with --clear to force every string through the backend again.'))
  console.log(
    dim('  The memory is scoped per game and per provider and model, so clearing is targeted.')
  )
}

async function collect(root: string, rows: string[][], relative = ''): Promise<string[][]> {
  const directory = relative.length > 0 ? posixJoin(root, relative) : root
  let entries
  try {
    entries = await nodeFs.readdir(directory)
  } catch {
    return rows
  }

  for (const entry of entries) {
    const child = relative.length > 0 ? posixJoin(relative, entry.name) : entry.name
    if (entry.isDirectory) {
      await collect(root, rows, child)
      continue
    }
    if (!entry.isFile || !entry.name.endsWith('.json')) continue

    const full = posixJoin(root, child)
    const [content, stat] = await Promise.all([nodeFs.readFile(full, 'utf-8'), nodeFs.stat(full)])
    rows.push([
      child.replace(/\.json$/, ''),
      num(countEntries(content)),
      `${(stat.size / BYTES_PER_MB).toFixed(1)} MB`
    ])
  }
  return rows
}

function countEntries(content: string): number {
  try {
    const parsed: unknown = JSON.parse(content)
    if (typeof parsed !== 'object' || parsed === null) return 0
    return Object.keys(parsed).length
  } catch {
    return 0
  }
}
