import { describe, expect, it } from 'vitest'

import { discoverMods } from '../src/index.js'
import { ck3Def, localeFile, stellarisDef } from './fixtures.js'
import { MemoryFs } from './memory-fs.js'

describe('discoverMods', () => {
  it('treats a folder holding a .mod file as a single mod', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/descriptor.mod': 'name="My Mod"',
      'workshop/mymod/localisation/a_l_english.yml': localeFile('english')
    })
    const result = await discoverMods('workshop/mymod', stellarisDef, fs)
    expect(result.single).toBe(true)
    expect(result.mods).toEqual([{ id: 'mymod', path: 'workshop/mymod' }])
  })

  it('treats a folder holding a localisation folder as a single mod', async () => {
    const fs = new MemoryFs({ 'mymod/localisation/a_l_english.yml': localeFile('english') })
    const result = await discoverMods('mymod', stellarisDef, fs)
    expect(result.single).toBe(true)
  })

  it('uses the game spelling to recognise the localisation folder', async () => {
    const fs = new MemoryFs({ 'mymod/localization/a_l_english.yml': localeFile('english') })
    expect((await discoverMods('mymod', ck3Def, fs)).single).toBe(true)
    // For Stellaris that folder is just a subfolder, so the root is a collection.
    expect((await discoverMods('mymod', stellarisDef, fs)).single).toBe(false)
  })

  it('lists every subfolder of a collection', async () => {
    const fs = new MemoryFs({
      'workshop/1/localisation/a_l_english.yml': localeFile('english'),
      'workshop/2/localisation/a_l_english.yml': localeFile('english')
    })
    const result = await discoverMods('workshop', stellarisDef, fs)
    expect(result.single).toBe(false)
    expect(result.mods.map(m => m.id).toSorted()).toEqual(['1', '2'])
  })

  it('skips dot folders', async () => {
    const fs = new MemoryFs({
      'workshop/.git/config': 'x',
      'workshop/mod/localisation/a_l_english.yml': localeFile('english')
    })
    const result = await discoverMods('workshop', stellarisDef, fs)
    expect(result.mods.map(m => m.id)).toEqual(['mod'])
  })

  it('falls back to the root itself when there is no subfolder', async () => {
    // The run still reports something rather than silently finding zero mods.
    const fs = new MemoryFs({ 'empty/readme.txt': 'x' })
    const result = await discoverMods('empty', stellarisDef, fs)
    expect(result.single).toBe(true)
    expect(result.mods).toEqual([{ id: 'empty', path: 'empty' }])
  })

  it('propagates a failure to read the root', async () => {
    // Unlike a single broken mod, an unreadable root leaves nothing to report on.
    const fs = new MemoryFs({})
    await expect(discoverMods('nowhere', stellarisDef, fs)).rejects.toThrow()
  })
})
