import { posixJoin } from './path.js'
import type { FsLike } from './types.js'

export interface WalkOptions {
  /** Collect only the files this returns true for. Receives the lowercased name. */
  acceptFile?: (lowerName: string, fullPath: string) => boolean
  /** Do not descend into the directories this returns true for. Receives the lowercased name. */
  skipDir?: (lowerName: string, fullPath: string) => boolean
}

export interface WalkResult {
  files: string[]
  /** Every directory visited, so a caller can reason about folder names it never entered. */
  dirs: string[]
  /**
   * Unreadable folders and skipped symlinks, one line each. Collected rather than thrown: a
   * single broken mod in a collection of four hundred must not abort the whole run.
   */
  diagnostics: string[]
}

/**
 * Recursively list the files below a directory.
 *
 * The single traversal of this package: `scan`, the mod readers and the pruner all go
 * through it, so a fix to symlink handling or error formatting lands in one place.
 *
 * Symlinks are skipped, never followed: a mod is untrusted third-party content and a link
 * pointing out of the sandbox would let a write escape it.
 */
export async function walkFiles(
  root: string,
  fs: FsLike,
  opts: WalkOptions = {}
): Promise<WalkResult> {
  const result: WalkResult = { files: [], dirs: [], diagnostics: [] }
  await descend(root, fs, opts, result)
  return result
}

async function descend(dir: string, fs: FsLike, opts: WalkOptions, out: WalkResult): Promise<void> {
  let entries
  try {
    entries = await fs.readdir(dir)
  } catch (err) {
    out.diagnostics.push(`readdir failed for ${dir}: ${stringifyError(err)}`)
    return
  }

  const subDirs: string[] = []
  for (const entry of entries) {
    const fullPath = posixJoin(dir, entry.name)
    const lowerName = entry.name.toLowerCase()

    if (entry.isSymlink) {
      out.diagnostics.push(`Skipped symlink (potential traversal): ${fullPath}`)
      continue
    }
    if (entry.isDirectory) {
      out.dirs.push(fullPath)
      if (opts.skipDir?.(lowerName, fullPath) === true) continue
      subDirs.push(fullPath)
      continue
    }
    if (!entry.isFile) continue
    if (opts.acceptFile && !opts.acceptFile(lowerName, fullPath)) continue
    out.files.push(fullPath)
  }

  // Sequential, so the traversal order is deterministic and the pool that calls this owns
  // the concurrency.
  for (const subDir of subDirs) {
    await descend(subDir, fs, opts, out)
  }
}

export function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
