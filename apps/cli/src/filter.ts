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

export const byIdAndName = <T extends { id: string; name: string }>(
  row: T
): readonly [string, string] => [row.id, row.name]
