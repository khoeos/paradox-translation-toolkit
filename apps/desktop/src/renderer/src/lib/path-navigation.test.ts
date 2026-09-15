import { describe, expect, it } from 'vitest'

import type { DetectedPathSuggestion } from './detected-paths.js'
import type { KnownPathEntry } from './known-paths.js'
import type { PathGroups } from './path-groups.js'
import { countPathGroupRows, getNextRowIndex, getPreviousRowIndex } from './path-navigation.js'

const makeEntry = (path: string): KnownPathEntry => ({
  path,
  gameId: 'stellaris',
  kind: 'modFolder',
  lastUsedAt: '2024-06-01T00:00:00.000Z',
  pinned: false
})

const makeSuggestion = (path: string): DetectedPathSuggestion => ({ kind: 'workshopContent', path })

const EMPTY_GROUPS: PathGroups = { pinned: [], detected: [], recent: [] }

const ONE_ROW_GROUPS: PathGroups = { pinned: [makeEntry('/mods/a')], detected: [], recent: [] }

const MANY_ROWS_GROUPS: PathGroups = {
  pinned: [makeEntry('/mods/a')],
  detected: [makeSuggestion('/steam/b'), makeSuggestion('/steam/c')],
  recent: [makeEntry('/mods/d')]
}

describe('countPathGroupRows', () => {
  it('counts across all three groups', () => {
    expect(countPathGroupRows(MANY_ROWS_GROUPS)).toBe(4)
  })

  it('is zero for empty groups', () => {
    expect(countPathGroupRows(EMPTY_GROUPS)).toBe(0)
  })
})

describe('getNextRowIndex', () => {
  it('returns null on an empty list', () => {
    expect(getNextRowIndex(EMPTY_GROUPS, null)).toBeNull()
    expect(getNextRowIndex(EMPTY_GROUPS, 0)).toBeNull()
  })

  it('starts at the first row when nothing is active yet', () => {
    expect(getNextRowIndex(MANY_ROWS_GROUPS, null)).toBe(0)
  })

  it('stays on the only row of a single-element list', () => {
    expect(getNextRowIndex(ONE_ROW_GROUPS, 0)).toBe(0)
  })

  it('advances to the next row across group boundaries', () => {
    expect(getNextRowIndex(MANY_ROWS_GROUPS, 0)).toBe(1)
    expect(getNextRowIndex(MANY_ROWS_GROUPS, 1)).toBe(2)
  })

  it('wraps from the last row back to the first', () => {
    expect(getNextRowIndex(MANY_ROWS_GROUPS, 3)).toBe(0)
  })
})

describe('getPreviousRowIndex', () => {
  it('returns null on an empty list', () => {
    expect(getPreviousRowIndex(EMPTY_GROUPS, null)).toBeNull()
    expect(getPreviousRowIndex(EMPTY_GROUPS, 0)).toBeNull()
  })

  it('starts at the last row when nothing is active yet', () => {
    expect(getPreviousRowIndex(MANY_ROWS_GROUPS, null)).toBe(3)
  })

  it('stays on the only row of a single-element list', () => {
    expect(getPreviousRowIndex(ONE_ROW_GROUPS, 0)).toBe(0)
  })

  it('moves to the previous row across group boundaries', () => {
    expect(getPreviousRowIndex(MANY_ROWS_GROUPS, 2)).toBe(1)
    expect(getPreviousRowIndex(MANY_ROWS_GROUPS, 1)).toBe(0)
  })

  it('wraps from the first row back to the last', () => {
    expect(getPreviousRowIndex(MANY_ROWS_GROUPS, 0)).toBe(3)
  })
})

describe('index bounds property', () => {
  const rowCount = countPathGroupRows(MANY_ROWS_GROUPS)
  const sweptIndices = [
    ...Array.from({ length: rowCount + 21 }, (_, i) => i - 10),
    1.5,
    -1.5,
    NaN
  ]

  const isNullOrInBounds = (index: number | null): boolean =>
    index === null || (Number.isInteger(index) && index >= 0 && index < rowCount)

  it('always returns null or an integer within [0, rowCount) for getNextRowIndex, across -10..rowCount+10, non-integers and NaN', () => {
    for (const activeIndex of sweptIndices) {
      expect(isNullOrInBounds(getNextRowIndex(MANY_ROWS_GROUPS, activeIndex))).toBe(true)
    }
  })

  it('always returns null or an integer within [0, rowCount) for getPreviousRowIndex, across -10..rowCount+10, non-integers and NaN', () => {
    for (const activeIndex of sweptIndices) {
      expect(isNullOrInBounds(getPreviousRowIndex(MANY_ROWS_GROUPS, activeIndex))).toBe(true)
    }
  })
})

describe('countPathGroupRows and index walking stay consistent', () => {
  const GROUPS_WITH_EMPTY_BETWEEN: PathGroups = {
    pinned: [makeEntry('/mods/a')],
    detected: [],
    recent: [makeEntry('/mods/b'), makeEntry('/mods/c')]
  }

  it('walking next as many times as countPathGroupRows visits every index exactly once before repeating', () => {
    const rowCount = countPathGroupRows(GROUPS_WITH_EMPTY_BETWEEN)
    let activeIndex: number | null = null
    const visited: number[] = []
    for (let i = 0; i < rowCount; i++) {
      activeIndex = getNextRowIndex(GROUPS_WITH_EMPTY_BETWEEN, activeIndex)
      if (activeIndex !== null) visited.push(activeIndex)
    }
    expect(new Set(visited).size).toBe(rowCount)
    expect(getNextRowIndex(GROUPS_WITH_EMPTY_BETWEEN, activeIndex)).toBe(0)
  })
})
