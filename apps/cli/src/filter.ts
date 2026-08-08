/**
 * Ported from PR #4 (e21ee7a, `src/cli/index.ts` `filterMods`) by Artem Kondrashev.
 */

/**
 * Keep only the rows the user pointed at.
 *
 * The two identifying fields are read through a `label` accessor rather than required on the row
 * itself: `audit` used to copy every key report in the collection into `{ ...key, id, name }`
 * just to satisfy the old shape, which on a detailed audit is one allocation per key per
 * language before a single row is printed.
 * @param rows - Every scanned mod, or every key report
 * @param filter - Text matched against the folder id and the declared name
 * @param label - The id and name of a row
 * @returns The matching rows, the input itself when there is no filter
 */
export function filterMods<T>(
  rows: readonly T[],
  filter: string | undefined,
  label: (row: T) => readonly [string, string]
): readonly T[] {
  if (!filter) return rows
  const needle = filter.toLowerCase()
  return rows.filter(row => {
    const [id, name] = label(row)
    return id.toLowerCase().includes(needle) || name.toLowerCase().includes(needle)
  })
}

/** The common case: a row that already carries `id` and `name`. */
export const byIdAndName = <T extends { id: string; name: string }>(
  row: T
): readonly [string, string] => [row.id, row.name]
