import { z } from 'zod'

import { ConvertModeSchema, LanguageCodeSchema } from '@ptt/shared-types'
import { TRANSLATE_PROVIDERS } from '@ptt/translate-core'

/**
 * Validation of a report read back from disk.
 *
 * Audit finding Q-7: the CLI `reports` command did `JSON.parse` and then asserted the result into
 * `Record<...>` and `KeyReport[]`, so a hand-edited or truncated file crashed somewhere far from
 * where it was read. A file is a process boundary, so it goes through zod.
 *
 * The schema is deliberately tolerant where the shape may grow (unknown keys are kept, counters
 * are optional) and strict where a consumer would otherwise misread it.
 */

const CountersSchema = z.object({
  translated: z.number(),
  cached: z.number(),
  failed: z.number()
})

const KeyReportSchema = z.object({
  modId: z.string(),
  modName: z.string(),
  language: LanguageCodeSchema,
  key: z.string(),
  file: z.string(),
  source: z.string(),
  state: z.enum(['own', 'patch', 'generated', 'english', 'kept', 'missing']),
  provider: z.string().optional(),
  reason: z.string().optional(),
  markupOnly: z.boolean().optional(),
  shadowed: z.boolean().optional()
})

const TotalsSchema = z.object({
  mods: z.number(),
  modsWithFiles: z.number(),
  created: z.number(),
  skipped: z.number(),
  unchanged: z.number(),
  failed: z.number(),
  pruned: z.number(),
  errors: z.number()
})

export const StoredRunReportSchema = z.object({
  startedAt: z.string(),
  finishedAt: z.string(),
  seconds: z.number(),
  request: z.object({
    path: z.string(),
    game: z.string(),
    mode: ConvertModeSchema,
    sourceLanguage: LanguageCodeSchema,
    targetLanguages: z.array(LanguageCodeSchema),
    selectedMods: z.union([z.number(), z.literal('all')]),
    translate: z
      .object({
        provider: z.enum(TRANSLATE_PROVIDERS),
        model: z.string(),
        batchSize: z.number(),
        concurrency: z.number()
      })
      .optional()
  }),
  translationMod: z
    .object({
      name: z.string(),
      folder: z.string(),
      path: z.string(),
      supportedVersion: z.string()
    })
    .optional(),
  totals: TotalsSchema,
  counters: CountersSchema.optional(),
  refusalsByReason: z.record(z.string(), z.number()),
  refusalsDropped: z.number(),
  mods: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      created: z.number(),
      skipped: z.number(),
      unchanged: z.number(),
      failed: z.number(),
      pruned: z.number(),
      translation: CountersSchema.optional(),
      errors: z.array(z.string())
    })
  ),
  untranslated: z.array(KeyReportSchema)
})

export type ParsedRunReport = z.infer<typeof StoredRunReportSchema>
