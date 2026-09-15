import type { PathGroups } from './path-groups.js'

export const countPathGroupRows = (groups: PathGroups): number =>
  groups.pinned.length + groups.detected.length + groups.recent.length

const isActiveRowIndex = (activeIndex: number | null): activeIndex is number =>
  activeIndex !== null && Number.isInteger(activeIndex)

const wrapRowIndex = (index: number, rowCount: number): number => ((index % rowCount) + rowCount) % rowCount

export const getNextRowIndex = (groups: PathGroups, activeIndex: number | null): number | null => {
  const rowCount = countPathGroupRows(groups)
  if (rowCount === 0) return null
  if (!isActiveRowIndex(activeIndex)) return 0
  return wrapRowIndex(activeIndex + 1, rowCount)
}

export const getPreviousRowIndex = (
  groups: PathGroups,
  activeIndex: number | null
): number | null => {
  const rowCount = countPathGroupRows(groups)
  if (rowCount === 0) return null
  if (!isActiveRowIndex(activeIndex)) return rowCount - 1
  return wrapRowIndex(activeIndex - 1, rowCount)
}
