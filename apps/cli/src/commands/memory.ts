import { posixJoin } from '@ptt/converter-core'
import { nodeFs } from '@ptt/fs-node'
import { clearMemoryFiles } from '@ptt/translate-core'

import type { Args } from '../args.js'
import type { CliOptions } from '../options.js'
import { dim, green, num, section, table } from '../output.js'

/**
 * How much the translation memory shared with the app holds, and clearing it.
 *
 * Ported from PR #4 (e21ee7a, `src/cli/index.ts` `commandMemory`) by Artem Kondrashev, with the
 * delete rewritten. The original ran `fs.rm(folder, { recursive: true, force: true })` on a path
 * derived from `--user-data`, so an empty value turned it into a recursive delete of a
 * cwd-relative folder (audit finding S-16). Here only files a memory could have written are
 * removed, and only after asserting the target sits inside the resolved userData folder.
 */

const BYTES_PER_MB = 1024 * 1024

export async function commandMemory(options: CliOptions, args: Args): Promise<void> {
  const root = posixJoin(options.userDataPath, 'translation-memory')

  if (args.flags.clear) {
    // No containment check here: `root` is built from `userDataPath` and is therefore inside it
    // by construction, so the assertion this used to make could never fail. What actually stops
    // S-16 is `resolveUserData` refusing an empty `--user-data`, plus `clearMemoryFiles` removing
    // only the file names a `TranslationMemory` can write, which is why it lives beside it.
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

  // No `updated` column: `FsLike.stat` carries no modification time, and the one that used to
  // sit here printed `new Date()` for every row, so it always said the whole store was fresh.
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

/** One row per memory file, the scope being its path below the memory root. */
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
    // A truncated file is what a killed run used to leave behind; it counts as empty.
    return 0
  }
}

