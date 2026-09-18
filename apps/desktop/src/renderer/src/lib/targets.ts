import type { ConvertMode, TargetContent } from '@ptt/shared'
import type {
  GameTokens,
  LanguageCode,
  TargetListProblem,
  TranslationTarget
} from '@ptt/shared/languages'
import {
  findTargetListIssue,
  isLanguageCode,
  normalizeTargets,
  shadowedLanguageOf,
  usesOwnToken
} from '@ptt/shared/languages'

import type { PersistedTranslate } from '@renderer/store/converter-form'

export type Translate = (key: string, options: Record<string, unknown>) => string

export const languageLabel = (t: Translate, language: string): string =>
  isLanguageCode(language) ? t(`languages.${language}`, {}) : language

export function targetLabel(t: Translate, target: TranslationTarget, tokens: GameTokens): string {
  const language = languageLabel(t, target.language)
  if (usesOwnToken(target, tokens)) return language
  return t('converter.customTarget.badge', { language, token: target.fileToken })
}

export interface TargetGrid {
  builtIn: Map<string, TranslationTarget>
  extra: TranslationTarget[]
  claimed: Set<string>
}

export const buildTargetGrid = (
  targets: readonly TranslationTarget[],
  tokens: GameTokens
): TargetGrid => {
  const builtIn = new Map<string, TranslationTarget>()
  const extra: TranslationTarget[] = []
  const claimed = new Set<string>()

  for (const target of normalizeTargets(targets)) {
    if (usesOwnToken(target, tokens)) {
      builtIn.set(target.language, target)
      continue
    }
    extra.push(target)
    claimed.add(target.language)
  }

  return { builtIn, extra, claimed }
}

export interface TargetListContext {
  targets: readonly TranslationTarget[]
  tokens: GameTokens
  mode: ConvertMode
  targetContent: TargetContent
  sourceLanguage: LanguageCode
  provider?: PersistedTranslate['provider']
  translateEnabled?: boolean
  gameName?: string
}

export interface ShadowingTarget {
  target: TranslationTarget
  owner: LanguageCode
}

export const findShadowingTarget = (
  targets: readonly TranslationTarget[],
  tokens: GameTokens,
  skipToken?: string
): ShadowingTarget | undefined => {
  for (const target of targets) {
    if (target.fileToken === skipToken) continue
    const owner = shadowedLanguageOf(target, tokens)
    if (owner !== undefined) return { target, owner }
  }
  return undefined
}

export function describeTargetProblem(
  t: Translate,
  problem: TargetListProblem,
  gameName?: string
): string | undefined {
  switch (problem.code) {
    case 'empty':
      return undefined
    case 'invalid-language':
      return t('converter.customTarget.invalidLanguage', {})
    case 'invalid-token':
      return t('converter.customTarget.invalidToken', {})
    case 'unknown-token':
      return t('converter.customTarget.unknownToken', {
        game: gameName ?? '',
        token: problem.fileToken
      })
    case 'duplicate-language':
      return t('converter.customTarget.duplicateLang', {
        language: languageLabel(t, problem.language)
      })
    case 'duplicate-token':
      return t('converter.customTarget.duplicateToken', { token: problem.fileToken })
    case 'rapidapi-unsupported':
      return t('converter.customTarget.rapidapiUnsupported', {
        language: languageLabel(t, problem.language)
      })
    case 'nothing-to-write':
      return t('converter.customTarget.nothingToWrite', { token: problem.fileToken })
  }
}

export function targetListError(t: Translate, ctx: TargetListContext): string | undefined {
  const targets = normalizeTargets(ctx.targets)
  const problem = findTargetListIssue(targets, ctx.tokens, {
    sourceLanguage: ctx.sourceLanguage,
    mode: ctx.mode,
    targetContent: ctx.targetContent,
    ...(ctx.translateEnabled === true && { provider: ctx.provider })
  })
  return problem === undefined ? undefined : describeTargetProblem(t, problem, ctx.gameName)
}

export function targetListWarning(t: Translate, ctx: TargetListContext): string | undefined {
  if (ctx.mode !== 'add-to-current' || ctx.targetContent !== 'missing-keys') return undefined

  const shadowing = findShadowingTarget(
    normalizeTargets(ctx.targets),
    ctx.tokens,
    ctx.tokens[ctx.sourceLanguage]
  )
  if (shadowing === undefined) return undefined
  return t('converter.customTarget.inPlaceCreateOnly', {
    language: languageLabel(t, shadowing.target.language),
    token: shadowing.target.fileToken,
    owner: languageLabel(t, shadowing.owner)
  })
}
