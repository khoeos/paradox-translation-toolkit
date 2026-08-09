/**
 * Tuning constants of the mod-level pipeline.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts`) by Artem Kondrashev.
 */

/** How many mods are read at the same time when no translation backend is involved. */
export const MOD_CONCURRENCY = 8

/** With a backend in the loop the backend is the bottleneck, so fewer mods run at once. */
export const MOD_CONCURRENCY_WITH_BACKEND = 2

/**
 * Share of a localisation mod's key set that must land on one mod to call it a patch of it.
 * Half of a patch landing on a single mod is no coincidence.
 */
export const KEY_OVERLAP_MATCH = 0.5

/**
 * Suffix for a generated file that sits next to an existing translation.
 * Topping up an existing file would mean rewriting someone else's work, so the missing keys
 * go into a file of their own instead.
 */
export const PARTIAL_SUFFIX = '_ptt_missing'

/** Fallbacks when the user leaves the translation mod name empty. */
export const DEFAULT_MOD_NAME = 'Missing Translations'
export const DEFAULT_MOD_FOLDER = 'missing_translations'

/**
 * Length caps on the generated folder names. Paths have to stay below the Windows limit,
 * and a namespace is nested two levels deep inside the generated mod.
 */
export const GENERATED_MOD_FOLDER_MAX_LEN = 48
export const NAMESPACE_ID_MAX_LEN = 32
export const NAMESPACE_LABEL_MAX_LEN = 32
