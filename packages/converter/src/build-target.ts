import { parse, serialize } from '@ptt/parser'
import type { BodyItem, LocaleEntry, LocaleFile } from '@ptt/parser'

import { MAX_SOURCE_FILE_BYTES } from './constants.js'
import { getParseSeverity, hasUnreadableContent } from './diagnostics.js'
import type { CreationJob, FsLike } from './types.js'

export interface BuildTargetOptions {
  job: CreationJob
  targetToken: string
  translations?: Map<string, string>
}

export async function buildTargetContent(options: BuildTargetOptions, fs: FsLike): Promise<string> {
  const { job, targetToken, translations } = options

  const stat = await fs.stat(job.source)
  if (stat.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error(`Source file exceeds ${MAX_SOURCE_FILE_BYTES} bytes: ${job.source}`)
  }

  const sourceContent = await fs.readFile(job.source, 'utf-8')
  const parsed = parse(sourceContent)
  if (hasUnreadableContent(parsed.diagnostics)) {
    const summary = parsed.diagnostics
      .filter(diagnostic => getParseSeverity(diagnostic.code) === 'error')
      .slice(0, 3)
      .map(
        diagnostic =>
          `${diagnostic.line}:${diagnostic.col} [${diagnostic.code}] ${diagnostic.message}`
      )
      .join('; ')
    throw new Error(`Parse failed for ${job.source}${summary.length > 0 ? `: ${summary}` : ''}`)
  }

  const entries: LocaleEntry[] = []

  if (job.content === 'missing-keys') {
    for (const entry of parsed.file.entries) {
      if (!job.keys.has(entry.key)) continue
      entries.push({ ...entry, value: resolveValue(entry, job, translations) })
    }

    const file: LocaleFile = {
      language: targetToken,
      entries,
      trailingComments: [],
      bom: parsed.file.bom,
      ...(parsed.file.lineEnding !== undefined && { lineEnding: parsed.file.lineEnding })
    }
    return serialize(file)
  }

  const body: BodyItem[] = []
  const items: BodyItem[] =
    parsed.file.body ?? parsed.file.entries.map((entry): BodyItem => ({ kind: 'entry', entry }))

  for (const item of items) {
    if (item.kind !== 'entry') {
      body.push(item)
      continue
    }
    if (!job.keys.has(item.entry.key)) continue
    const entry: LocaleEntry = {
      ...item.entry,
      value: resolveValue(item.entry, job, translations)
    }
    entries.push(entry)
    body.push({ kind: 'entry', entry })
  }

  const file: LocaleFile = {
    language: targetToken,
    entries,
    trailingComments: [],
    bom: parsed.file.bom,
    ...(parsed.file.lineEnding !== undefined && { lineEnding: parsed.file.lineEnding }),
    body
  }
  return serialize(file)
}

function resolveValue(
  entry: LocaleEntry,
  job: CreationJob,
  translations?: Map<string, string>
): string {
  return job.known.get(entry.key) ?? translations?.get(entry.value) ?? entry.value
}
