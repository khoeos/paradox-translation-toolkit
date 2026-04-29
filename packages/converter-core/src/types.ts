import type { ConvertMode, GameDefinition, LanguageCode } from '@ptt/shared-types'

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

export type GameContextRef = GameDefinition

export interface DiscoveredFile {
  absolutePath: string
  relativePath: string
  modRoot: string
  language: LanguageCode
  languageToken: string
  canonicalKey: string
  isInOverrideDir: boolean
}

export interface ScanResult {
  rootDir: string
  files: DiscoveredFile[]
  diagnostics: string[]
}

export interface DiffPlan {
  sourceLanguage: LanguageCode
  targetLanguages: LanguageCode[]
  missingFiles: Partial<Record<LanguageCode, DiscoveredFile[]>>
}

export interface DiffOptions {
  overwrite?: boolean
}

export interface CopyAction {
  sourcePath: string
  targetPath: string
  sandboxRoot: string
  sourceLanguage: LanguageCode
  targetLanguage: LanguageCode
  sourceLanguageToken: string
  targetLanguageToken: string
}

export interface CopyPlan {
  mode: ConvertMode
  outputDir?: string
  actions: CopyAction[]
}

export interface ApplyReport {
  created: Partial<Record<LanguageCode, string[]>>
  overwritten: Partial<Record<LanguageCode, string[]>>
  failed: Partial<Record<LanguageCode, { path: string; error: string }[]>>
}

export interface ApplyOptions {
  overwrite?: boolean
  onProgress?: (event: ProgressEvent) => void
}

export type ProgressEvent =
  | { type: 'apply-progress'; processed: number; total: number }
  | { type: 'scan-progress'; processed: number; total: number }
