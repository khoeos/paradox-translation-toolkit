import { promises as fs } from 'node:fs'

import type { FsLike } from '@ptt/converter-core'
import type { FetchLike } from '@ptt/translate-core'

/**
 * The one production `FsLike`.
 *
 * It lived in `apps/desktop/src/main/services/node-fs.ts` while the desktop app was its only
 * consumer. `apps/cli` is the second, and the root `CLAUDE.md` names byte-identical duplication as
 * a failure class, so it moved here rather than being copied.
 */
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

/**
 * The one production `FetchLike`.
 *
 * Same story as `nodeFs`: the desktop worker, the desktop translate service and two CLI commands
 * each carried a byte-identical copy, so a timeout, a proxy or a header added for one of them
 * would have left the other three behind and made the same run behave differently depending on
 * which front end started it. `@ptt/translate-core` still never reaches for a global `fetch`.
 */
export const nodeFetch: FetchLike = async (url, init) => {
  const response = await fetch(url, init)
  return {
    ok: response.ok,
    status: response.status,
    statusText: response.statusText,
    text: () => response.text(),
    json: () => response.json()
  }
}
