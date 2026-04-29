import { z } from 'zod'

import { getAllGameIds } from '@ptt/game-registry'
import { VALID_UI_LANGUAGES } from '@ptt/i18n'
import { LanguageCodeSchema } from '@ptt/shared-types'

import { publicProcedure, router } from '../trpc.js'

// Constrain per-game records to the closed set of registered game ids. Avoids
// rogue keys (`""`, typos, attacker-supplied) polluting settings.json.
const GameIdSchema = z.enum(getAllGameIds())

const SettingsPatchSchema = z
  .object({
    lastModFolder: z.partialRecord(GameIdSchema, z.string()),
    lastOutputFolder: z.partialRecord(GameIdSchema, z.string()),
    defaultSourceLanguage: LanguageCodeSchema,
    sourceLanguage: z.partialRecord(GameIdSchema, LanguageCodeSchema),
    targetLanguages: z.partialRecord(GameIdSchema, z.array(LanguageCodeSchema)),
    mode: z.enum(['add-to-current', 'extract-to-folder']),
    overwrite: z.boolean(),
    themeOverride: z.enum(['system', 'light', 'dark']),
    uiLanguage: z.enum(VALID_UI_LANGUAGES),
    lastGameId: GameIdSchema.nullable(),
    autoCheckUpdates: z.boolean(),
    updateChannel: z.enum(['stable', 'beta']),
    userAllowedFolders: z.array(z.string())
  })
  .partial()

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
  })
})
