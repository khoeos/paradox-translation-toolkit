import { z } from 'zod'

import { getAllGameIds } from '@ptt/game-registry'
import { ConvertModeSchema, LanguageCodeSchema } from '@ptt/shared-types'

import { publicProcedure, router } from '../trpc.js'
import { TranslateConfigSchema, toTranslateConfig } from './translate.js'

const GameIdSchema = z.enum(getAllGameIds())

export const converterRouter = router({
  scan: publicProcedure
    .input(
      z.object({
        gameId: GameIdSchema,
        rootDir: z.string()
      })
    )
    .mutation(({ ctx, input }) => ctx.converter.scan(input.gameId, input.rootDir)),

  run: publicProcedure
    .input(
      z.object({
        gameId: GameIdSchema,
        rootDir: z.string(),
        sourceLanguage: LanguageCodeSchema,
        targetLanguages: z.array(LanguageCodeSchema).min(1),
        mode: ConvertModeSchema,
        outputDir: z.string().optional(),
        overwrite: z.boolean().optional()
      })
    )
    .mutation(({ ctx, input }) => ctx.converter.run(input)),

  /** Report what a whole collection is missing, key by key, writing nothing. */
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
      // Destructured rather than spread: `{ translate: undefined }` keeps the key, and
      // exactOptionalPropertyTypes rightly refuses it.
      const { translate, ...rest } = input
      return ctx.converter.scanMods({
        ...rest,
        ...(translate !== undefined && { translate: toTranslateConfig(translate) })
      })
    }),

  /** Write the missing files, translating their values when a backend is configured. */
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
