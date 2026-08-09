import { parse, serialize } from '@ptt/parser'
import type { LocaleEntry, LocaleFile } from '@ptt/parser'

import type { CreationJob, FsLike } from './types.js'

/**
 * Build the content of one generated localisation file.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts` `buildTargetContent`) by
 * Artem Kondrashev.
 *
 * The original retagged the language with `content.replaceAll('l_english', 'l_russian')` over
 * the whole file. Audit finding S-1 (high): any key holding that substring, `special_english`
 * and friends, was renamed, stopped matching `job.keys`, and vanished from the generated file
 * with no error and no trace. Here the file is parsed, the language is a field, and only values
 * are assigned, so that shape cannot come back.
 */
export interface BuildTargetOptions {
  job: CreationJob
  /** The game's file token for the target language, which becomes the `l_<token>:` header. */
  targetToken: string
  /** Source value to translation, for the keys this run had translated. */
  translations?: Map<string, string>
}

export async function buildTargetContent(options: BuildTargetOptions, fs: FsLike): Promise<string> {
  const { job, targetToken, translations } = options
  const sourceContent = await fs.readFile(job.source, 'utf-8')
  const parsed = parse(sourceContent)
  if (!parsed.ok) {
    const summary = parsed.diagnostics
      .filter(diagnostic => diagnostic.severity === 'error')
      .slice(0, 3)
      .map(
        diagnostic =>
          `${diagnostic.line}:${diagnostic.col} [${diagnostic.code}] ${diagnostic.message}`
      )
      .join('; ')
    throw new Error(`Parse failed for ${job.source}${summary.length > 0 ? `: ${summary}` : ''}`)
  }

  // Only the keys nobody translated yet, so the file never shadows an existing translation.
  const entries: LocaleEntry[] = []
  for (const entry of parsed.file.entries) {
    if (!job.keys.has(entry.key)) continue
    entries.push({ ...entry, value: resolveValue(entry, job, translations) })
  }

  // No `body`: the generated file is ours, so it carries the header and the entries and none of
  // the source's comments or blank lines.
  const file: LocaleFile = {
    language: targetToken,
    entries,
    trailingComments: [],
    bom: parsed.file.bom,
    ...(parsed.file.lineEnding !== undefined && { lineEnding: parsed.file.lineEnding })
  }
  return serialize(file)
}

function resolveValue(
  entry: LocaleEntry,
  job: CreationJob,
  translations?: Map<string, string>
): string {
  // What an earlier run of ours translated wins: it is already in the file being rewritten and
  // was never sent to a translator twice.
  return job.known.get(entry.key) ?? translations?.get(entry.value) ?? entry.value
}
