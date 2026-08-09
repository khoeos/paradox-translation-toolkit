/**
 * Ported from PR #4 (e21ee7a, `src/main/translateFn/index.ts`) by Artem Kondrashev.
 */

/**
 * Run an async task over a list, a few items at a time.
 *
 * A fixed pool of runners pulling from a shared cursor, rather than fixed-size chunks: one
 * slow mod in a batch would otherwise idle the whole batch until it finishes.
 * @param items - The items to process
 * @param limit - Maximum number of tasks running at once
 * @param task - The task to run
 * @returns The results, in the order of `items`
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length })
  let cursor = 0

  const runners = Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, async () => {
    for (;;) {
      const index = cursor++
      if (index >= items.length) return
      const item = items[index]
      if (item === undefined) continue
      results[index] = await task(item, index)
    }
  })

  await Promise.all(runners)
  return results
}
