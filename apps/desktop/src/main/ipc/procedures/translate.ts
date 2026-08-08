import { z } from 'zod'

import { getAllGameIds, getGame } from '@ptt/game-registry'
import { LanguageCodeSchema } from '@ptt/shared-types'
import type { TranslateConfig } from '@ptt/translate-core'
import { TRANSLATE_LIMITS, TRANSLATE_PROVIDERS } from '@ptt/translate-core'

import { publicProcedure, router } from '../trpc.js'

/**
 * Translation-side procedures.
 *
 * Ported from PR #4 (e21ee7a, the `TEST_PROVIDER` and `CLEAR_MEMORY` IPC channels) by
 * Artem Kondrashev.
 */

const GameIdSchema = z.enum(getAllGameIds())

/** The settings a run needs, minus the API key, which never leaves the renderer's memory. */
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

/**
 * The validated input as a `TranslateConfig`.
 *
 * zod renders an optional field as `T | undefined`, which `exactOptionalPropertyTypes` refuses to
 * assign to `field?: T`. Dropping the absent keys is the honest conversion.
 */
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
  /** One round trip against the configured backend, so a misconfiguration is caught early. */
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

  /** Forget every translation learnt so far, for one game or for all of them. */
  clearMemory: publicProcedure
    .input(z.object({ gameId: GameIdSchema.optional() }))
    .mutation(({ ctx, input }) => ctx.translate.clearMemory(input.gameId)),

  /** Ask for the game installation folder: its own localisation is the best glossary there is. */
  pickGamePath: publicProcedure.mutation(({ ctx }) => ctx.dialog.pickFolder())
})
