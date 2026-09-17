import {
  getLanguageDisplayName,
  getTargetLanguageKey,
  isFileToken,
  isLanguageLabel,
  normalizeTargetLanguage,
  shadowedLanguageOf,
  usesOwnToken
} from '@ptt/shared/languages'
import type { LanguageCode, TranslationTarget } from '@ptt/shared/languages'

import type { GameContextRef } from './types.js'

export interface ResolvedTarget extends TranslationTarget {
  usesOwnToken: boolean
  shadowsLanguage?: LanguageCode
}

interface ResolvedTargets {
  sourceToken: string | undefined
  targets: ResolvedTarget[]
  warnings: string[]
}

export function resolveTargets(
  gameDef: GameContextRef,
  sourceLanguage: LanguageCode,
  targets: readonly TranslationTarget[]
): ResolvedTargets {
  const tokens = gameDef.languageFileToken
  const warnings: string[] = []
  const sourceToken = tokens[sourceLanguage]

  if (sourceToken === undefined) {
    warnings.push(
      `This game ships no localisation file name for the source language "${sourceLanguage}"`
    )
    return { sourceToken: undefined, targets: [], warnings }
  }

  const resolved: ResolvedTarget[] = []
  const seenLanguages = new Set<string>()
  const seenTokens = new Set<string>()

  for (const requested of targets) {
    const language = normalizeTargetLanguage(requested.language)
    const { fileToken } = requested

    if (!isLanguageLabel(language)) {
      warnings.push(`"${requested.language}" is not a usable language name, skipped as a target`)
      continue
    }
    if (language === sourceLanguage) {
      warnings.push(`"${language}" is the source language, skipped as a target`)
      continue
    }
    if (!isFileToken(fileToken)) {
      warnings.push(`"${fileToken}" is not a usable localisation file token, "${language}" skipped`)
      continue
    }
    const languageKey = getTargetLanguageKey(language)
    if (seenLanguages.has(languageKey)) {
      warnings.push(`"${language}" is already a target, the second one is skipped`)
      continue
    }
    if (seenTokens.has(fileToken)) {
      warnings.push(`another target already writes "l_${fileToken}", "${language}" skipped`)
      continue
    }

    seenLanguages.add(languageKey)
    seenTokens.add(fileToken)

    const target: TranslationTarget = { language, fileToken }
    const shadows = shadowedLanguageOf(target, tokens)
    resolved.push({
      language,
      fileToken,
      usesOwnToken: usesOwnToken(target, tokens),
      ...(shadows !== undefined && { shadowsLanguage: shadows })
    })
  }

  return { sourceToken, targets: resolved, warnings }
}

export const describeInPlaceShadowing = (
  target: ResolvedTarget,
  owner: LanguageCode,
  replacing: boolean
): string =>
  replacing
    ? `${getLanguageDisplayName(target.language)} written under "l_${target.fileToken}" replaces the ` +
      `${getLanguageDisplayName(owner)} files inside the mod ; a second run reads them back as ` +
      `${getLanguageDisplayName(owner)}`
    : `${getLanguageDisplayName(target.language)} written under "l_${target.fileToken}" only creates the ` +
      `${getLanguageDisplayName(owner)} files the mod does not already have`
