import { z } from 'zod'

import { getAllGameIds } from '@ptt/games'
import {
  ConvertModeSchema,
  LanguageCodeSchema,
  TargetContentSchema
} from '@ptt/shared'

import { publicProcedure, router } from '../trpc.js'
import { TranslateConfigSchema, toTranslateConfig } from './translate.js'

const GameIdSchema = z.enum(getAllGameIds())

export const converterRouter = router({
  scanMods: publicProcedure
    .input(
      z.object({
        gameId: GameIdSchema,
        rootDir: z.string(),
        sourceLanguage: LanguageCodeSchema,
        targetLanguages: z.array(LanguageCodeSchema).min(1),
        modName: z.string().optional(),
        translate: TranslateConfigSchema.optional()
      })
    )
    .mutation(({ ctx, input }) => {
      const { translate, ...rest } = input
      return ctx.converter.scanMods({
        ...rest,
        ...(translate !== undefined && { translate: toTranslateConfig(translate) })
      })
    }),

  convert: publicProcedure
    .input(
      z.object({
        gameId: GameIdSchema,
        rootDir: z.string(),
        sourceLanguage: LanguageCodeSchema,
        targetLanguages: z.array(LanguageCodeSchema).min(1),
        mode: ConvertModeSchema,
        outputDir: z.string().optional(),
        selectedMods: z.array(z.string()).optional(),
        modName: z.string().optional(),
        targetContent: TargetContentSchema.optional(),
        translate: TranslateConfigSchema.optional()
      })
    )
    .mutation(({ ctx, input }) => {
      const { translate, ...rest } = input
      return ctx.converter.convert({
        ...rest,
        ...(translate !== undefined && { translate: toTranslateConfig(translate) })
      })
    }),

  cancel: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(({ ctx, input }) => ctx.converter.cancel(input.jobId))
})
