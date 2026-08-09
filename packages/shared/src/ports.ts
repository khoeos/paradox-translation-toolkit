/**
 * The contracts a core package uses to reach the outside world.
 *
 * They live here, and not in the package that happens to have needed them first, because a
 * contract nobody owns gets owned by an accident: `FsLike` was declared inside `@ptt/converter`,
 * so `@ptt/translate`, `@ptt/report` and `@ptt/fs-node` all had to declare a dependency on the
 * converter to name a nine-method structural interface that has nothing to do with converting.
 * `@ptt/fs-node` in particular pointed at both cores while every core pointed back here, which is
 * the shape that made "fold the small packages together" impossible.
 *
 * Nothing in this file is a value: it is the vocabulary of dependency injection, and it is what
 * lets every core be unit-tested against an in-memory fake with no disk and no network.
 */

/**
 * `AbortSignal` is not in `lib: ["ES2023"]`, and the cores must not pull `@types/node` in to get
 * it: `/// <reference types="node" />` in `@ptt/translate` is exactly what leaked node's globals
 * into `@ptt/report` and let `node:fs` compile inside two packages documented as FS-agnostic.
 *
 * Declared as a global interface instead, so it *merges* with the real one wherever the host does
 * provide it (`@ptt/fs-node` hands this straight to `fetch`, and gets the full type) and stands
 * alone as an opaque handle wherever it does not.
 */
declare global {
  interface AbortSignal {
    readonly aborted: boolean
  }
}

/** One entry of a directory listing. `isSymlink` is separate: links are skipped, never followed. */
export interface FsDirEntry {
  name: string
  isDirectory: boolean
  isFile: boolean
  isSymlink: boolean
}

/** The subset of a filesystem the cores use. The one production implementation is `@ptt/fs-node`. */
export interface FsLike {
  readFile(path: string, encoding: 'utf-8'): Promise<string>
  writeFile(path: string, data: string, encoding: 'utf-8'): Promise<void>
  rename(from: string, to: string): Promise<void>
  copyFile(from: string, to: string): Promise<void>
  unlink(path: string): Promise<void>
  readdir(path: string): Promise<FsDirEntry[]>
  mkdir(path: string, opts: { recursive: true }): Promise<void>
  stat(path: string): Promise<{ isDirectory: boolean; isFile: boolean; size: number }>
  exists(path: string): Promise<boolean>
}

/**
 * The subset of `fetch` `@ptt/translate` uses.
 *
 * Injected rather than reached for globally: it is the only way the engine and the three providers
 * can be tested without a network, and it keeps that package free of any ambient runtime
 * assumption.
 */
export type FetchLike = (url: string, init: FetchInit) => Promise<FetchResponse>

export interface FetchInit {
  method: string
  headers: Record<string, string>
  body: string
  /** Both the per-request timeout and the run-wide stop, combined by the caller. */
  signal?: AbortSignal
}

export interface FetchResponse {
  ok: boolean
  status: number
  statusText: string
  text(): Promise<string>
  json(): Promise<unknown>
}
