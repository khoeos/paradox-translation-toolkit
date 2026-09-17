import { z } from 'zod'

import { getAllGameIds, getGame } from '@ptt/games'
import {
  ConvertModeSchema,
  LANGUAGE_CODES,
  LanguageCodeSchema,
  TargetContentSchema,
  TranslationTargetSchema,
  describeTargetListProblem,
  findNothingToWriteTarget,
  findTargetListProblem,
  findUnrecognizedTarget,
  normalizeTargets,
  type ConvertMode,
  type LanguageCode,
  type TargetContent,
  type TranslationTarget
} from '@ptt/shared'

import { publicProcedure, router } from '../trpc.js'
import { TranslateConfigSchema, toTranslateConfig } from './translate.js'

const GameIdSchema = z.enum(getAllGameIds())

const TargetsSchema = z.array(TranslationTargetSchema).min(1)

interface TargetListInput {
  gameId: string
  targets: readonly TranslationTarget[]
  translate?: { provider: string } | undefined
}

const withTargetProblems = (
  input: TargetListInput,
  ctx: z.RefinementCtx
): TranslationTarget[] | undefined => {
  const game = getGame(input.gameId)
  const tokens = game?.languageFileToken ?? {}
  const targets = normalizeTargets(input.targets)

  const problem = findTargetListProblem(targets, tokens)
  if (problem !== undefined) {
    ctx.addIssue(
      describeTargetListProblem(problem, targets, {
        displayName: game?.displayName ?? 'This game',
        languageFileToken: tokens
      })
    )
    return undefined
  }

  const unsupported =
    input.translate?.provider === 'rapidapi' ? findUnrecognizedTarget(targets) : undefined
  if (unsupported !== undefined) {
    ctx.addIssue(
      `The RapidAPI provider cannot translate into "${unsupported.language}": it only supports ` +
        `${LANGUAGE_CODES.join(', ')}. Pick a built-in language, or use the OpenAI or Ollama provider.`
    )
    return undefined
  }

  return targets
}

const withConvertTargetProblems = (
  input: TargetListInput & {
    sourceLanguage: LanguageCode
    mode: ConvertMode
    targetContent?: TargetContent | undefined
  },
  ctx: z.RefinementCtx
): void => {
  const targets = withTargetProblems(input, ctx)
  const game = getGame(input.gameId)
  if (targets === undefined || game === undefined) return

  const nothingToWrite = findNothingToWriteTarget(
    targets,
    game.languageFileToken,
    input.sourceLanguage,
    input.mode,
    input.targetContent ?? 'missing-keys'
  )
  if (nothingToWrite !== undefined) {
    ctx.addIssue(
      `l_${nothingToWrite.fileToken} is already how this mod is written: with "Only missing keys" ` +
        'there is nothing to add. Pick "Complete file", or use "Create a translation mod".'
    )
  }
}

export const ScanModsInputSchema = z
  .object({
    gameId: GameIdSchema,
    rootDir: z.string(),
    sourceLanguage: LanguageCodeSchema,
    targets: TargetsSchema,
    modName: z.string().optional(),
    translate: TranslateConfigSchema.optional()
  })
  .superRefine((input, ctx) => {
    withTargetProblems(input, ctx)
  })

export const ConvertInputSchema = z
  .object({
    gameId: GameIdSchema,
    rootDir: z.string(),
    sourceLanguage: LanguageCodeSchema,
    targets: TargetsSchema,
    mode: ConvertModeSchema,
    outputDir: z.string().optional(),
    selectedMods: z.array(z.string()).optional(),
    modName: z.string().optional(),
    targetContent: TargetContentSchema.optional(),
    translate: TranslateConfigSchema.optional()
  })
  .superRefine(withConvertTargetProblems)

export const converterRouter = router({
  scanMods: publicProcedure.input(ScanModsInputSchema).mutation(({ ctx, input }) => {
    const { translate, targets, ...rest } = input
    return ctx.converter.scanMods({
      ...rest,
      targets: normalizeTargets(targets),
      ...(translate !== undefined && { translate: toTranslateConfig(translate) })
    })
  }),

  convert: publicProcedure.input(ConvertInputSchema).mutation(({ ctx, input }) => {
    const { translate, targets, ...rest } = input
    return ctx.converter.convert({
      ...rest,
      targets: normalizeTargets(targets),
      ...(translate !== undefined && { translate: toTranslateConfig(translate) })
    })
  }),

  cancel: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(({ ctx, input }) => ctx.converter.cancel(input.jobId))
})
