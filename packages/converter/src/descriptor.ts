import { posixJoin } from './path.js'
import type { Descriptor, FsLike, TranslationMod } from './types.js'

const NAME_RE = /^\s*name\s*=\s*"([^"]*)"/m
const SUPPORTED_VERSION_RE = /^\s*supported_version\s*=\s*"([^"]*)"/m
const REMOTE_FILE_ID_RE = /^\s*remote_file_id\s*=\s*"([^"]*)"/m
const DEPENDENCIES_BLOCK_RE = /dependencies\s*=\s*\{([^}]*)\}/
const QUOTED_RE = /"([^"]*)"/g

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
    } catch {}
  }

  return {}
}

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

export function buildDescriptor(mod: TranslationMod, withPath: boolean): string {
  const lines = [
    'version="1.0"',
    'tags={',
    '\t"Translation"',
    '}',
    `name="${mod.name.replaceAll('"', "'")}"`,
    `supported_version="${mod.supportedVersion}"`
  ]
  if (withPath) lines.push(`path="mod/${mod.folder}"`)
  return `${lines.join('\n')}\n`
}
