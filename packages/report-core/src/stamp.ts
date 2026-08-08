/**
 * A file name that sorts by date and holds no character Windows refuses.
 *
 * Ported from PR #4 (e21ee7a, `src/main/report/index.ts`) by Artem Kondrashev. The timestamp is
 * a parameter rather than read from the clock, so a report path is reproducible and testable.
 * @param at - Milliseconds since the epoch
 * @returns `2026-08-08T14-37-33-000Z`
 */
export function stamp(at: number): string {
  return new Date(at).toISOString().replaceAll(':', '-').replaceAll('.', '-')
}
