export function sumByLanguage(counts: Partial<Record<string, number>>): number {
  return Object.values(counts).reduce<number>((sum, count) => sum + (count ?? 0), 0)
}
