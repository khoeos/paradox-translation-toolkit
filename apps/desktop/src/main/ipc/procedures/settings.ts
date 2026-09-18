import { TRPCError } from '@trpc/server'
import { isAbsolute } from 'node:path'
import { z } from 'zod'

import { getAllGameIds } from '@ptt/games'
import { VALID_UI_LANGUAGES } from '@ptt/i18n'
import {
  ConvertModeSchema,
  LanguageCodeSchema,
  TargetContentSchema,
  TranslationTargetSchema
} from '@ptt/shared'
import { TRANSLATE_LIMITS, TRANSLATE_PROVIDERS } from '@ptt/translate/defaults'

import { isCriticalFolder } from '../../services/path-policy.js'
import { KNOWN_PATH_KINDS } from '../../services/settings-service.js'
import { publicProcedure, router } from '../trpc.js'

const GameIdSchema = z.enum(getAllGameIds())
const KnownPathKindSchema = z.enum(KNOWN_PATH_KINDS)
const ProviderSchema = z.enum(TRANSLATE_PROVIDERS)

const bounded = (limits: { min: number; max: number }): z.ZodNumber =>
  z.number().int().min(limits.min).max(limits.max)

const TranslateSettingsSchema = z.object({
  enabled: z.boolean(),
  provider: ProviderSchema,
  backends: z.partialRecord(ProviderSchema, z.object({ baseUrl: z.string(), model: z.string() })),
  batchSize: bounded(TRANSLATE_LIMITS.batchSize),
  concurrency: bounded(TRANSLATE_LIMITS.concurrency),
  retries: bounded(TRANSLATE_LIMITS.retries),
  timeout: bounded(TRANSLATE_LIMITS.timeout)
})

export const SettingsPatchSchema = z
  .object({
    lastModFolder: z.partialRecord(GameIdSchema, z.string()),
    lastOutputFolder: z.partialRecord(GameIdSchema, z.string()),
    gamePath: z.partialRecord(GameIdSchema, z.string()),
    defaultSourceLanguage: LanguageCodeSchema,
    sourceLanguage: z.partialRecord(GameIdSchema, LanguageCodeSchema),
    targetLanguages: z.partialRecord(GameIdSchema, z.array(LanguageCodeSchema)),
    targets: z.partialRecord(GameIdSchema, z.array(TranslationTargetSchema)),
    mode: ConvertModeSchema,
    targetContent: TargetContentSchema,
    themeOverride: z.enum(['system', 'light', 'dark']),
    uiLanguage: z.enum(VALID_UI_LANGUAGES),
    lastGameId: GameIdSchema.nullable(),
    autoCheckUpdates: z.boolean(),
    updateChannel: z.enum(['stable', 'beta']),
    userAllowedFolders: z.array(z.string()),
    translate: TranslateSettingsSchema,
    knownPaths: z.array(
      z.object({
        path: z.string(),
        gameId: GameIdSchema,
        kind: KnownPathKindSchema,
        lastUsedAt: z.iso.datetime(),
        pinned: z.boolean()
      })
    )
  })
  .partial()

export const assertAddableKnownPath = (path: string): void => {
  if (!isAbsolute(path)) {
    throw new TRPCError({ code: 'BAD_REQUEST', message: `Path is not absolute: ${path}` })
  }
  if (isCriticalFolder(path)) {
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Refusing to remember critical system folder: ${path}`
    })
  }
}

export const settingsRouter = router({
  getAll: publicProcedure.query(({ ctx }) => ctx.settings.getAll()),
  update: publicProcedure.input(SettingsPatchSchema).mutation(({ ctx, input }) => {
    const next = ctx.settings.update(input)
    if (input.updateChannel !== undefined) {
      ctx.updater.applyConfig({ channel: input.updateChannel })
    }
    if (input.lastModFolder) {
      for (const v of Object.values(input.lastModFolder)) {
        if (v !== undefined) ctx.openable.add(v)
      }
    }
    if (input.lastOutputFolder) {
      for (const v of Object.values(input.lastOutputFolder)) {
        if (v !== undefined) ctx.openable.add(v)
      }
    }
    return next
  }),
  reset: publicProcedure.mutation(({ ctx }) => {
    const next = ctx.settings.reset()
    ctx.updater.applyConfig({ channel: next.updateChannel })
    return next
  }),
  addKnownPath: publicProcedure
    .input(
      z.object({
        path: z.string(),
        gameId: GameIdSchema,
        kind: KnownPathKindSchema,
        pinned: z.boolean().optional()
      })
    )
    .mutation(({ ctx, input }) => {
      assertAddableKnownPath(input.path)
      ctx.openable.add(input.path)
      return ctx.settings.addKnownPath(input)
    }),
  togglePinKnownPath: publicProcedure
    .input(z.object({ path: z.string(), gameId: GameIdSchema, kind: KnownPathKindSchema }))
    .mutation(({ ctx, input }) =>
      ctx.settings.togglePinKnownPath(input.path, input.gameId, input.kind)
    ),
  removeKnownPath: publicProcedure
    .input(z.object({ path: z.string(), gameId: GameIdSchema, kind: KnownPathKindSchema }))
    .mutation(({ ctx, input }) =>
      ctx.settings.removeKnownPath(input.path, input.gameId, input.kind)
    ),
  clearKnownPaths: publicProcedure
    .input(z.object({ gameId: GameIdSchema, kind: KnownPathKindSchema }))
    .mutation(({ ctx, input }) => ctx.settings.clearKnownPaths(input.gameId, input.kind))
})
