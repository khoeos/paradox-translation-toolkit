import type { LanguageCode } from '@ptt/shared'

export function sumByLanguage(counts: Partial<Record<LanguageCode, number>>): number {
  return Object.values(counts).reduce<number>((sum, count) => sum + (count ?? 0), 0)
}
