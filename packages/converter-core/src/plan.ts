import { buildFilename, parseFilename } from '@ptt/parser-core'
import type { ConvertMode, LanguageCode } from '@ptt/shared-types'

import { posixBasename, posixJoin, posixNormalizeStrict, posixSplit } from './path.js'
import type { CopyAction, CopyPlan, DiffPlan, GameContextRef } from './types.js'

export interface PlanOptions {
  mode: ConvertMode
  outputDir?: string
  gameDef: GameContextRef
}

export function plan(diffPlan: DiffPlan, opts: PlanOptions): CopyPlan {
  const { mode, outputDir, gameDef } = opts
  const sourceToken = gameDef.languageFileToken[diffPlan.sourceLanguage]
  if (!sourceToken) {
    throw new Error(`No file token defined for source language "${diffPlan.sourceLanguage}"`)
  }

  // Refuse silent collisions when two mod roots share the same basename.
  if (mode === 'extract-to-folder' && outputDir !== undefined) {
    assertUniqueModRootBasenames(diffPlan)
  }

  const actions: CopyAction[] = []
  for (const [targetLangRaw, files] of Object.entries(diffPlan.missingFiles)) {
    const targetLang = targetLangRaw as LanguageCode
    if (!files) continue
    const targetToken = gameDef.languageFileToken[targetLang]
    if (!targetToken) continue

    for (const file of files) {
      const targetRelative = posixNormalizeStrict(
        rewriteLanguageInPath(file.relativePath, sourceToken, targetToken)
      )
      const sandboxRoot =
        mode === 'extract-to-folder' && outputDir !== undefined ? outputDir : file.modRoot
      const targetPath = posixNormalizeStrict(
        mode === 'extract-to-folder' && outputDir !== undefined
          ? posixJoin(outputDir, posixBasename(file.modRoot), targetRelative)
          : posixJoin(file.modRoot, targetRelative)
      )

      actions.push({
        sourcePath: file.absolutePath,
        targetPath,
        sandboxRoot,
        sourceLanguage: diffPlan.sourceLanguage,
        targetLanguage: targetLang,
        sourceLanguageToken: sourceToken,
        targetLanguageToken: targetToken
      })
    }
  }

  return {
    mode,
    ...(outputDir !== undefined && { outputDir }),
    actions
  }
}

function assertUniqueModRootBasenames(diffPlan: DiffPlan): void {
  const byBasename = new Map<string, Set<string>>()
  for (const files of Object.values(diffPlan.missingFiles)) {
    if (!files) continue
    for (const file of files) {
      const base = posixBasename(file.modRoot)
      let bucket = byBasename.get(base)
      if (!bucket) {
        bucket = new Set()
        byBasename.set(base, bucket)
      }
      bucket.add(file.modRoot)
    }
  }
  const collisions: string[] = []
  for (const [base, roots] of byBasename) {
    if (roots.size > 1) {
      collisions.push(`"${base}": ${[...roots].join(', ')}`)
    }
  }
  if (collisions.length > 0) {
    throw new Error(
      `Cannot extract to folder: multiple mod roots share the same basename. Rename or run them separately.\n  ${collisions.join('\n  ')}`
    )
  }
}

function rewriteLanguageInPath(relativePath: string, fromToken: string, toToken: string): string {
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
