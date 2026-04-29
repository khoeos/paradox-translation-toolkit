import { dirname } from 'node:path'

import { canonicalize } from './path-policy.js'

/**
 * Authorisation layer for `shell.openPath`: tracks app-configured/produced
 * paths plus session-only "Allow once" decisions.
 */
export class OpenableRegistry {
  private allowed = new Set<string>()
  private session = new Set<string>()

  add(path: string): void {
    if (!path) return
    this.allowed.add(canonicalize(path))
  }

  /** Add a file's path AND its parent directory (UI typically opens the dir). */
  addFileAndParent(path: string): void {
    if (!path) return
    this.add(path)
    this.add(dirname(path))
  }

  has(path: string): boolean {
    return this.allowed.has(canonicalize(path))
  }

  /** Authorize a path for the current process lifetime only, no persistence. */
  addSession(path: string): void {
    if (!path) return
    this.session.add(canonicalize(path))
  }

  hasSession(path: string): boolean {
    return this.session.has(canonicalize(path))
  }
}
