import { parse, serialize } from '@ptt/parser-core'
import type { LanguageCode } from '@ptt/shared-types'

import { posixContains, posixDirname } from './path.js'
import type { ApplyOptions, ApplyReport, CopyAction, CopyPlan, FsLike } from './types.js'

const MAX_SOURCE_FILE_BYTES = 50 * 1024 * 1024

let tmpCounter = 0
function randomTmpSuffix(): string {
  return `${Date.now().toString(36)}-${(++tmpCounter).toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export async function apply(
  plan: CopyPlan,
  fs: FsLike,
  options: ApplyOptions = {}
): Promise<ApplyReport> {
  const { onProgress, overwrite = false } = options
  const created: Partial<Record<LanguageCode, string[]>> = {}
  const overwritten: Partial<Record<LanguageCode, string[]>> = {}
  const failed: Partial<Record<LanguageCode, { path: string; error: string }[]>> = {}
  const total = plan.actions.length
  let processed = 0

  for (const action of plan.actions) {
    try {
      if (!posixContains(action.sandboxRoot, action.targetPath)) {
        throw new Error(
          `Refusing to write outside sandbox: "${action.targetPath}" escapes "${action.sandboxRoot}"`
        )
      }
      const exists = await fs.exists(action.targetPath)
      if (exists && !overwrite) {
        processed++
        onProgress?.({ type: 'apply-progress', processed, total })
        continue
      }

      const newContent = await transformSource(action, fs)

      const targetDir = posixDirname(action.targetPath)
      if (targetDir.length > 0) {
        await fs.mkdir(targetDir, { recursive: true })
      }

      // Atomic write order: tmp file -> backup -> rename. Failed
      // transformSource never leaves a stale `.bak`. Crash mid-flight
      // always leaves either the old or the new file, never a torn one.
      const tmpPath = `${action.targetPath}.${randomTmpSuffix()}.tmp`
      try {
        await fs.writeFile(tmpPath, newContent, 'utf-8')
        if (exists) {
          await fs.copyFile(action.targetPath, `${action.targetPath}.bak`).catch(() => {})
        }
        await fs.rename(tmpPath, action.targetPath)
      } catch (err) {
        await fs.unlink(tmpPath).catch(() => {})
        throw err
      }

      const bucket = exists ? overwritten : created
      const list = bucket[action.targetLanguage] ?? []
      list.push(action.targetPath)
      bucket[action.targetLanguage] = list
    } catch (err) {
      const list = failed[action.targetLanguage] ?? []
      list.push({ path: action.targetPath, error: stringifyError(err) })
      failed[action.targetLanguage] = list
    }
    processed++
    onProgress?.({ type: 'apply-progress', processed, total })
  }

  return { created, overwritten, failed }
}

async function transformSource(action: CopyAction, fs: FsLike): Promise<string> {
  // Refuse sources above 50MB to bound worker memory.
  const sourceStat = await fs.stat(action.sourcePath)
  if (sourceStat.size > MAX_SOURCE_FILE_BYTES) {
    throw new Error(
      `Source file exceeds ${MAX_SOURCE_FILE_BYTES} bytes: ${action.sourcePath} (${sourceStat.size} bytes)`
    )
  }
  const sourceContent = await fs.readFile(action.sourcePath, 'utf-8')
  const parseResult = parse(sourceContent)
  if (!parseResult.ok) {
    const summary = parseResult.diagnostics
      .filter(d => d.severity === 'error')
      .slice(0, 3)
      .map(d => `${d.line}:${d.col} [${d.code}] ${d.message}`)
      .join('; ')
    throw new Error(
      `Parse failed for ${action.sourcePath}${summary.length > 0 ? `: ${summary}` : ''}`
    )
  }
  const transformed = {
    ...parseResult.file,
    language: action.targetLanguageToken
  }
  return serialize(transformed)
}

function stringifyError(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
