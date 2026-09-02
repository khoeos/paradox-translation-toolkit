import type { ParsedFilename } from './types.js'

const LANGUAGE_MARKER = '_l_'
const LANGUAGE_RE = /^[a-z_]+$/i
const YML_EXTENSION_RE = /\.yml$/i

const isMarkerAt = (stem: string, index: number): boolean =>
  stem[index] === '_' &&
  (stem[index + 1] === 'l' || stem[index + 1] === 'L') &&
  stem[index + 2] === '_'

export function parseFilename(name: string): ParsedFilename | null {
  if (!YML_EXTENSION_RE.test(name)) return null
  const stem = name.slice(0, -'.yml'.length)
  for (let index = stem.length - LANGUAGE_MARKER.length - 1; index >= 1; index--) {
    if (!isMarkerAt(stem, index)) continue
    const language = stem.slice(index + LANGUAGE_MARKER.length)
    if (!LANGUAGE_RE.test(language)) return null
    return { base: stem.slice(0, index), language: language.toLowerCase() }
  }
  return null
}

export function buildFilename(base: string, language: string): string {
  return `${base}${LANGUAGE_MARKER}${language}.yml`
}
