import { promises as fs } from 'node:fs'

import type { FsLike } from '@ptt/converter-core'

/** `FsLike` adapter wrapping `node:fs/promises`. */
export const nodeFs: FsLike = {
  async readFile(path, encoding) {
    return fs.readFile(path, encoding)
  },
  async writeFile(path, data, encoding) {
    await fs.writeFile(path, data, encoding)
  },
  async rename(from, to) {
    await fs.rename(from, to)
  },
  async copyFile(from, to) {
    await fs.copyFile(from, to)
  },
  async unlink(path) {
    await fs.unlink(path)
  },
  async readdir(path) {
    const entries = await fs.readdir(path, { withFileTypes: true })
    return entries.map(e => ({
      name: e.name,
      isDirectory: e.isDirectory(),
      isFile: e.isFile(),
      isSymlink: e.isSymbolicLink()
    }))
  },
  async mkdir(path, opts) {
    await fs.mkdir(path, opts)
  },
  async stat(path) {
    const s = await fs.stat(path)
    return { isDirectory: s.isDirectory(), isFile: s.isFile(), size: s.size }
  },
  async exists(path) {
    try {
      await fs.access(path)
      return true
    } catch {
      return false
    }
  }
}
