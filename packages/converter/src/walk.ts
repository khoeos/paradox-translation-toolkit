import type { ModDiagnostic } from './diagnostics.js'
import { posixJoin } from './path.js'
import type { FsLike } from './types.js'

export interface WalkOptions {
  acceptFile?: (lowerName: string, fullPath: string) => boolean
  skipDir?: (lowerName: string, fullPath: string) => boolean
}

export interface WalkResult {
  files: string[]
  dirs: string[]
  diagnostics: ModDiagnostic[]
}

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
    out.diagnostics.push({
      severity: 'error',
      message: `readdir failed for ${dir}: ${stringifyError(err)}`
    })
    return
  }

  const subDirs: string[] = []
  for (const entry of entries) {
    const fullPath = posixJoin(dir, entry.name)
    const lowerName = entry.name.toLowerCase()

    if (entry.isSymlink) {
      out.diagnostics.push({
        severity: 'error',
        message: `Skipped symlink (potential traversal): ${fullPath}`
      })
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

  for (const subDir of subDirs) {
    await descend(subDir, fs, opts, out)
  }
}

export function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
