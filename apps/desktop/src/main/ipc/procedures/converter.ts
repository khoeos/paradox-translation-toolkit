import { z } from 'zod'

import { getAllGameIds, getGame } from '@ptt/games'
import {
  ConvertModeSchema,
  LanguageCodeSchema,
  TargetContentSchema,
  TranslationTargetSchema,
  describeTargetListProblem,
  findTargetListIssue,
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
  sourceLanguage: LanguageCode
  mode: ConvertMode
  targetContent?: TargetContent | undefined
  translate?: { enabled: boolean; provider: string } | undefined
}

const withTargetProblems = (input: TargetListInput, ctx: z.RefinementCtx): void => {
  const game = getGame(input.gameId)
  const tokens = game?.languageFileToken ?? {}
  const targets = normalizeTargets(input.targets)

  const problem = findTargetListIssue(targets, tokens, {
    sourceLanguage: input.sourceLanguage,
    mode: input.mode,
    targetContent: input.targetContent ?? 'missing-keys',
    ...(input.translate?.enabled === true && { provider: input.translate.provider })
  })
  if (problem === undefined) return

  ctx.addIssue(
    describeTargetListProblem(problem, targets, {
      displayName: game?.displayName ?? 'This game',
      languageFileToken: tokens
    })
  )
}


export const ScanModsInputSchema = z
  .object({
    gameId: GameIdSchema,
    rootDir: z.string(),
    sourceLanguage: LanguageCodeSchema,
    targets: TargetsSchema,
    mode: ConvertModeSchema,
    targetContent: TargetContentSchema.optional(),
    modName: z.string().optional(),
    translate: TranslateConfigSchema.optional(),
    retranslateOwnKeys: z.boolean().optional()
  })
  .superRefine(withTargetProblems)


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
    translate: TranslateConfigSchema.optional(),
    retranslateOwnKeys: z.boolean().optional()
  })
  .superRefine(withTargetProblems)


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
