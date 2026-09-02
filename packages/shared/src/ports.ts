declare global {
  interface AbortSignal {
    readonly aborted: boolean
  }
}

export interface FsDirEntry {
  name: string
  isDirectory: boolean
  isFile: boolean
  isSymlink: boolean
}

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

export type FetchLike = (url: string, init: FetchInit) => Promise<FetchResponse>

export interface FetchInit {
  method: string
  headers: Record<string, string>
  body: string
  signal?: AbortSignal
}

export interface FetchResponse {
  ok: boolean
  status: number
  statusText: string
  text(): Promise<string>
  json(): Promise<unknown>
}
