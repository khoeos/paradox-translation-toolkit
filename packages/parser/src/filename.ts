import type { ParsedFilename } from './types.js'

const FILENAME_RE = /^(.+)_l_([a-z_]+)\.yml$/i

export function parseFilename(name: string): ParsedFilename | null {
  const match = FILENAME_RE.exec(name)
  if (!match) return null
  const [, base, language] = match
  if (!base || !language) return null
  return { base, language: language.toLowerCase() }
}

export function buildFilename(base: string, language: string): string {
  return `${base}_l_${language}.yml`
}
