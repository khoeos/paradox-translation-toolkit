import type { LanguageCode } from '@ptt/shared'

/**
 * Sum a per-language record. The UI, the CLI and the run report all want one number.
 *
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts` `sumLanguages`, which existed
 * in three identical copies across main, renderer and CLI: audit finding Q-6) by
 * Artem Kondrashev.
 */
export function sumByLanguage(counts: Partial<Record<LanguageCode, number>>): number {
  return Object.values(counts).reduce<number>((sum, count) => sum + (count ?? 0), 0)
}
