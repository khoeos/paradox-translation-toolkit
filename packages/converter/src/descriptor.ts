/**
 * Reading a Paradox mod descriptor (`.mod`).
 *
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts` `readDescriptor`) by
 * Artem Kondrashev.
 */

import { posixJoin } from './path.js'
import type { Descriptor, FsLike, TranslationMod } from './types.js'

const NAME_RE = /^\s*name\s*=\s*"([^"]*)"/m
const SUPPORTED_VERSION_RE = /^\s*supported_version\s*=\s*"([^"]*)"/m
const REMOTE_FILE_ID_RE = /^\s*remote_file_id\s*=\s*"([^"]*)"/m
const DEPENDENCIES_BLOCK_RE = /dependencies\s*=\s*\{([^}]*)\}/
const QUOTED_RE = /"([^"]*)"/g

/**
 * Read what we need from a mod descriptor.
 *
 * A mod can hold several `.mod` files; `descriptor.mod` is the one the game reads, so it is
 * tried first. An unreadable descriptor is not worth failing the mod for: the caller falls
 * back to the folder name.
 * @param modPath - The mod folder
 * @param fs - The injected filesystem
 * @returns The declared metadata, every field optional
 */
export async function readDescriptor(modPath: string, fs: FsLike): Promise<Descriptor> {
  let names: string[]
  try {
    const entries = await fs.readdir(modPath)
    names = entries
      .filter(entry => entry.isFile && entry.name.toLowerCase().endsWith('.mod'))
      .map(entry => entry.name)
      .toSorted(
        (a, b) =>
          Number(b.toLowerCase() === 'descriptor.mod') -
          Number(a.toLowerCase() === 'descriptor.mod')
      )
  } catch {
    return {}
  }

  for (const descriptor of names) {
    try {
      const content = await fs.readFile(posixJoin(modPath, descriptor), 'utf-8')
      const name = NAME_RE.exec(content)?.[1]?.trim()
      const supportedVersion = SUPPORTED_VERSION_RE.exec(content)?.[1]?.trim()
      const remoteFileId = REMOTE_FILE_ID_RE.exec(content)?.[1]?.trim()
      // dependencies={ "Original Mod" } holds the untranslated name of the patched mod.
      const block = DEPENDENCIES_BLOCK_RE.exec(content)?.[1] ?? ''
      const dependencies = [...block.matchAll(QUOTED_RE)]
        .map(match => match[1]?.trim() ?? '')
        .filter(dependency => dependency.length > 0)

      if (name || supportedVersion) {
        return {
          ...(name !== undefined && { name }),
          ...(supportedVersion !== undefined && { supportedVersion }),
          ...(remoteFileId !== undefined && { remoteFileId }),
          dependencies
        }
      }
    } catch {
      // Unreadable descriptor is not worth failing the mod for.
    }
  }

  return {}
}

/**
 * Reuse the game version the source mods declare rather than inventing one.
 *
 * Mods that actually needed files describe the version this translation targets, so they are
 * preferred; when none of them declares one, every readable mod counts.
 * @param mods - The processed mods
 * @returns The most frequent supported_version, `*` when none was readable
 */
export function pickSupportedVersion(
  mods: ReadonlyArray<{ createdCount: number; supportedVersion?: string }>
): string {
  const relevant = mods.filter(mod => mod.createdCount > 0 && mod.supportedVersion !== undefined)
  const source = relevant.length > 0 ? relevant : mods.filter(m => m.supportedVersion !== undefined)

  const counts = new Map<string, number>()
  for (const mod of source) {
    const version = mod.supportedVersion
    if (version === undefined) continue
    counts.set(version, (counts.get(version) ?? 0) + 1)
  }

  let best = '*'
  let bestCount = 0
  for (const [version, count] of counts) {
    if (count > bestCount) {
      best = version
      bestCount = count
    }
  }
  return best
}

/**
 * Content of a Paradox mod descriptor.
 *
 * A generated mod needs two of them: `<gameModsDir>/<folder>.mod` carries `path=` and is what
 * the launcher reads, `<mod>/descriptor.mod` carries none and is what the game reads.
 * @param mod - The translation mod description
 * @param withPath - Add the `path` field, required on the outer `.mod` file
 * @returns The descriptor content
 */
export function buildDescriptor(mod: TranslationMod, withPath: boolean): string {
  const lines = [
    'version="1.0"',
    'tags={',
    '\t"Translation"',
    '}',
    // A quote in the name would end the field early, so it becomes an apostrophe.
    `name="${mod.name.replaceAll('"', "'")}"`,
    `supported_version="${mod.supportedVersion}"`
  ]
  if (withPath) lines.push(`path="mod/${mod.folder}"`)
  return `${lines.join('\n')}\n`
}
