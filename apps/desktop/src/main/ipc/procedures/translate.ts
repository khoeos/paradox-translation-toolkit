import { z } from 'zod'

import { getAllGameIds, getGame } from '@ptt/games'
import { LanguageCodeSchema } from '@ptt/shared'
import type { TranslateConfig } from '@ptt/translate'
import { TRANSLATE_LIMITS, TRANSLATE_PROVIDERS } from '@ptt/translate'

import { publicProcedure, router } from '../trpc.js'

const GameIdSchema = z.enum(getAllGameIds())

export const TranslateConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(TRANSLATE_PROVIDERS),
  baseUrl: z.string().min(1),
  model: z.string(),
  apiKey: z.string().optional(),
  batchSize: z
    .number()
    .int()
    .min(TRANSLATE_LIMITS.batchSize.min)
    .max(TRANSLATE_LIMITS.batchSize.max),
  concurrency: z
    .number()
    .int()
    .min(TRANSLATE_LIMITS.concurrency.min)
    .max(TRANSLATE_LIMITS.concurrency.max),
  retries: z.number().int().min(TRANSLATE_LIMITS.retries.min).max(TRANSLATE_LIMITS.retries.max),
  timeout: z.number().int().min(TRANSLATE_LIMITS.timeout.min).max(TRANSLATE_LIMITS.timeout.max),
  domain: z.string().optional(),
  gamePath: z.string().optional()
})

export type TranslateConfigInput = z.infer<typeof TranslateConfigSchema>

export function toTranslateConfig(input: TranslateConfigInput): TranslateConfig {
  return {
    enabled: input.enabled,
    provider: input.provider,
    baseUrl: input.baseUrl,
    model: input.model,
    batchSize: input.batchSize,
    concurrency: input.concurrency,
    retries: input.retries,
    timeout: input.timeout,
    ...(input.apiKey !== undefined && { apiKey: input.apiKey }),
    ...(input.domain !== undefined && { domain: input.domain }),
    ...(input.gamePath !== undefined && { gamePath: input.gamePath })
  }
}

export const translateRouter = router({
  testProvider: publicProcedure
    .input(
      z.object({
        gameId: GameIdSchema,
        targetLanguage: LanguageCodeSchema,
        config: TranslateConfigSchema
      })
    )
    .mutation(({ ctx, input }) => {
      const game = getGame(input.gameId)
      return ctx.translate.testProvider({
        ...toTranslateConfig(input.config),
        targetLanguage: input.targetLanguage,
        ...(game?.domain !== undefined && { domain: game.domain })
      })
    }),

  clearMemory: publicProcedure
    .input(z.object({ gameId: GameIdSchema.optional() }))
    .mutation(({ ctx, input }) => ctx.translate.clearMemory(input.gameId)),

  pickGamePath: publicProcedure.mutation(({ ctx }) => ctx.dialog.pickFolder())
})
