import type { FsDirEntry, FsLike } from '../src/index.js'
import { posixDirname, posixSplit } from '../src/index.js'

export class MemoryFs implements FsLike {
  private files = new Map<string, string>()
  private dirs = new Set<string>()
  private symlinks = new Set<string>()

  constructor(initial: Record<string, string> = {}) {
    for (const [path, content] of Object.entries(initial)) {
      this.seedFile(path, content)
    }
  }

  seedFile(path: string, content: string): void {
    this.files.set(normalize(path), content)
    let dir = posixDirname(normalize(path))
    while (dir.length > 0) {
      this.dirs.add(dir)
      const next = posixDirname(dir)
      if (next === dir) break
      dir = next
    }
  }

  /** Mark a path as a symlink. The path itself can be a file or a directory. */
  seedSymlink(path: string): void {
    this.symlinks.add(normalize(path))
  }

  snapshot(): Map<string, string> {
    return new Map(this.files)
  }

  async readFile(path: string, _encoding: 'utf-8'): Promise<string> {
    const content = this.files.get(normalize(path))
    if (content === undefined) throw new Error(`ENOENT: ${path}`)
    return content
  }

  async writeFile(path: string, data: string, _encoding: 'utf-8'): Promise<void> {
    this.seedFile(path, data)
  }

  async rename(from: string, to: string): Promise<void> {
    const fromNorm = normalize(from)
    const content = this.files.get(fromNorm)
    if (content === undefined) throw new Error(`ENOENT: ${from}`)
    this.files.delete(fromNorm)
    this.seedFile(to, content)
  }

  async copyFile(from: string, to: string): Promise<void> {
    const content = this.files.get(normalize(from))
    if (content === undefined) throw new Error(`ENOENT: ${from}`)
    this.seedFile(to, content)
  }

  async unlink(path: string): Promise<void> {
    const norm = normalize(path)
    if (!this.files.has(norm)) throw new Error(`ENOENT: ${path}`)
    this.files.delete(norm)
  }

  async readdir(path: string): Promise<FsDirEntry[]> {
    const norm = normalize(path)
    if (norm.length > 0 && !this.dirs.has(norm)) {
      throw new Error(`ENOENT: ${path}`)
    }
    const prefix = norm.length === 0 ? '' : `${norm}/`
    const seen = new Map<string, FsDirEntry>()
    const isSymlinkAt = (full: string): boolean => this.symlinks.has(full)

    for (const filePath of this.files.keys()) {
      if (norm.length > 0 && !filePath.startsWith(prefix)) continue
      const rest = filePath.slice(prefix.length)
      if (rest.length === 0) continue
      const segments = posixSplit(rest)
      const first = segments[0]
      if (first === undefined || seen.has(first)) continue
      const childFull = `${prefix}${first}`
      const isFile = segments.length === 1
      seen.set(first, {
        name: first,
        isDirectory: !isFile,
        isFile,
        isSymlink: isSymlinkAt(childFull)
      })
    }
    for (const dir of this.dirs) {
      if (norm.length > 0 && !dir.startsWith(prefix)) continue
      if (dir === norm) continue
      const rest = dir.slice(prefix.length)
      if (rest.length === 0) continue
      const first = posixSplit(rest)[0]
      if (first === undefined || seen.has(first)) continue
      const childFull = `${prefix}${first}`
      seen.set(first, {
        name: first,
        isDirectory: true,
        isFile: false,
        isSymlink: isSymlinkAt(childFull)
      })
    }

    return Array.from(seen.values())
  }

  async mkdir(path: string, _opts: { recursive: true }): Promise<void> {
    let dir = normalize(path)
    while (dir.length > 0) {
      this.dirs.add(dir)
      const next = posixDirname(dir)
      if (next === dir) break
      dir = next
    }
  }

  async stat(path: string): Promise<{ isDirectory: boolean; isFile: boolean; size: number }> {
    const norm = normalize(path)
    const content = this.files.get(norm)
    if (content !== undefined) {
      return { isDirectory: false, isFile: true, size: utf8ByteLength(content) }
    }
    if (this.dirs.has(norm)) return { isDirectory: true, isFile: false, size: 0 }
    throw new Error(`ENOENT: ${path}`)
  }

  async exists(path: string): Promise<boolean> {
    const norm = normalize(path)
    return this.files.has(norm) || this.dirs.has(norm)
  }
}

function normalize(path: string): string {
  return path.replaceAll('\\', '/').replace(/\/+$/, '')
}

// Approximate UTF-8 byte length used only by tests' synthetic stat().
function utf8ByteLength(s: string): number {
  let bytes = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x80) bytes += 1
    else if (c < 0x800) bytes += 2
    else if (c >= 0xd800 && c < 0xdc00) {
      bytes += 4
      i++ // skip low surrogate
    } else bytes += 3
  }
  return bytes
}
