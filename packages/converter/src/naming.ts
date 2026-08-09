/**
 * Mod identity and filename sanitisation.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts`) by Artem Kondrashev.
 */

import { buildFilename, parseFilename } from '@ptt/parser'

import { NAMESPACE_ID_MAX_LEN, NAMESPACE_LABEL_MAX_LEN, PARTIAL_SUFFIX } from './constants.js'
import { posixBasename, posixDirname, posixJoin } from './path.js'

/**
 * Turn any label into something usable as a folder name.
 * @param value - The label
 * @param maxLength - Maximum length of the result, so paths stay below the Windows limit
 * @returns The sanitized name, empty when nothing usable is left
 */
export function sanitizeFolderName(value: string, maxLength: number): string {
  return (
    value
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase()
      .slice(0, maxLength)
      // The slice can land mid-separator, so trim again.
      .replace(/_+$/g, '')
  )
}

/**
 * Build the folder holding the files of one source mod inside the generated translation mod.
 *
 * The namespace is the pivot of the whole idempotence story: it ties every generated file
 * back to the mod it was generated for, which is what makes carrying translations over,
 * spotting orphans and pruning possible.
 * @param modId - The source mod folder name, often a bare workshop id
 * @param name - The source mod declared name
 * @returns A folder name unique per source mod
 */
export function getModNamespace(modId: string, name: string): string {
  const id = sanitizeFolderName(modId, NAMESPACE_ID_MAX_LEN)
  const label = sanitizeFolderName(name, NAMESPACE_LABEL_MAX_LEN)
  if (!id) return label || 'mod'
  // A workshop id carries no meaning, a folder already named after the mod needs no suffix.
  return label && !id.includes(label) ? `${id}_${label}` : id
}

/**
 * Rename a target file so it can live next to an existing translation.
 * @param target - The natural target path
 * @returns The same path with the partial marker before the language tail
 */
export function withPartialSuffix(target: string): string {
  const base = posixBasename(target)
  // The games only load files whose name ends with _l_<language>.yml, so the marker has to
  // go before that tail, never after it.
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
