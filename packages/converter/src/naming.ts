import { buildFilename, parseFilename } from '@ptt/parser'

import { NAMESPACE_ID_MAX_LEN, NAMESPACE_LABEL_MAX_LEN, PARTIAL_SUFFIX } from './constants.js'
import { posixBasename, posixDirname, posixJoin, posixSplit } from './path.js'

export function sanitizeFolderName(value: string, maxLength: number): string {
  return value
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
    .slice(0, maxLength)
    .replace(/_+$/g, '')
}

export function getModNamespace(modId: string, name: string): string {
  const id = sanitizeFolderName(modId, NAMESPACE_ID_MAX_LEN)
  const label = sanitizeFolderName(name, NAMESPACE_LABEL_MAX_LEN)
  if (!id) return label || 'mod'
  return label && !id.includes(label) ? `${id}_${label}` : id
}

export function withPartialSuffix(target: string): string {
  const base = posixBasename(target)
  const parsed = parseFilename(base)
  const renamed = parsed
    ? buildFilename(`${parsed.base}${PARTIAL_SUFFIX}`, parsed.language)
    : withSuffixBeforeExtension(base)

  const dir = posixDirname(target)
  return dir === '' ? renamed : posixJoin(dir, renamed)
}

function withSuffixBeforeExtension(base: string): string {
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return `${base}${PARTIAL_SUFFIX}`
  return `${base.slice(0, dot)}${PARTIAL_SUFFIX}${base.slice(dot)}`
}

export function rewriteLanguageInPath(
  relativePath: string,
  fromToken: string,
  toToken: string
): string {
  return posixSplit(relativePath)
    .map(part => {
      if (part.toLowerCase() === fromToken) return toToken
      const parsed = parseFilename(part)
      if (parsed && parsed.language === fromToken) {
        return buildFilename(parsed.base, toToken)
      }
      return part
    })
    .join('/')
}
