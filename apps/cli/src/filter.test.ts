import { describe, expect, it } from 'vitest'

import { byIdAndName, filterMods } from './filter.js'

const mods = [
  { id: '2887679980', name: 'Ethics Overhaul' },
  { id: 'muslim_ench', name: 'Muslim Enchantments' },
  { id: '1234', name: 'Other Mod' }
]

describe('filterMods', () => {
  it('returns everything without a filter', () => {
    expect(filterMods(mods, undefined, byIdAndName)).toHaveLength(3)
    expect(filterMods(mods, '', byIdAndName)).toHaveLength(3)
  })

  it('matches on the declared name', () => {
    expect(filterMods(mods, 'ethics', byIdAndName).map(mod => mod.id)).toEqual(['2887679980'])
  })

  it('matches on the folder id, which is a workshop number for a subscribed mod', () => {
    expect(filterMods(mods, '28876', byIdAndName).map(mod => mod.name)).toEqual(['Ethics Overhaul'])
  })

  it('is case insensitive', () => {
    expect(filterMods(mods, 'MUSLIM', byIdAndName)).toHaveLength(1)
  })

  it('matches a substring anywhere', () => {
    expect(filterMods(mods, 'Enchant', byIdAndName)).toHaveLength(1)
  })

  it('returns nothing when nothing matches', () => {
    expect(filterMods(mods, 'stellaris', byIdAndName)).toEqual([])
  })

  it('never mutates the input', () => {
    const copy = [...mods]
    filterMods(mods, 'ethics', byIdAndName)
    expect(mods).toEqual(copy)
  })

  it('reads the identity through the accessor, whatever the row shape', () => {
    const keys = [
      { modId: '2887679980', modName: 'Ethics Overhaul', key: 'K1' },
      { modId: '1234', modName: 'Other Mod', key: 'K2' }
    ]
    const matched = filterMods(keys, 'ethics', key => [key.modId, key.modName])
    expect(matched.map(key => key.key)).toEqual(['K1'])
  })

  it('hands back the input array itself when there is no filter, allocating nothing', () => {
    expect(filterMods(mods, undefined, byIdAndName)).toBe(mods)
  })
})
