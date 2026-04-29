import { z } from 'zod'

import { getAllGameIds } from '@ptt/game-registry'
import { LanguageCodeSchema } from '@ptt/shared-types'

import { publicProcedure, router } from '../trpc.js'

const ConvertModeSchema = z.enum(['add-to-current', 'extract-to-folder'])

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

  cancel: publicProcedure
    .input(z.object({ jobId: z.string() }))
    .mutation(({ ctx, input }) => ctx.converter.cancel(input.jobId))
})
