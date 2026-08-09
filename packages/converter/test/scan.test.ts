import { describe, expect, it } from 'vitest'

import { scan } from '../src/scan.js'
import { ck3Def, localeFile, stellarisDef } from './fixtures.js'
import { MemoryFs } from './memory-fs.js'

describe('scan', () => {
  it('discovers a single english file in nested layout', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const result = await scan('workshop', stellarisDef, fs)
    expect(result.files).toHaveLength(1)
    expect(result.files[0]?.language).toBe('en')
    expect(result.files[0]?.languageToken).toBe('english')
  })

  it('discovers files in flat layout (no language directory)', async () => {
    const fs = new MemoryFs({
      'workshop/mymod/localisation/foo_l_english.yml': localeFile('english')
    })
    const result = await scan('workshop', stellarisDef, fs)
    expect(result.files).toHaveLength(1)
    expect(result.files[0]?.language).toBe('en')
  })

  it('discovers Stellaris-specific tokens (simp_chinese, braz_por)', async () => {
    const fs = new MemoryFs({
      'mod/localisation/simp_chinese/foo_l_simp_chinese.yml': localeFile('simp_chinese'),
      'mod/localisation/braz_por/foo_l_braz_por.yml': localeFile('braz_por')
    })
    const result = await scan('mod', stellarisDef, fs)
    const langs = result.files.map(f => f.language).toSorted()
    expect(langs).toEqual(['pt-BR', 'zh-Hans'])
  })

  it('handles CK3 localization (American spelling) directory', async () => {
    const fs = new MemoryFs({
      'mod/localization/english/foo_l_english.yml': localeFile('english')
    })
    const result = await scan('mod', ck3Def, fs)
    expect(result.files).toHaveLength(1)
    expect(result.files[0]?.modRoot).toBe('mod')
  })

  it('flags isInOverrideDir for files under replace/', async () => {
    const fs = new MemoryFs({
      'mod/localisation/replace/foo_l_english.yml': localeFile('english')
    })
    const result = await scan('mod', stellarisDef, fs)
    expect(result.files[0]?.isInOverrideDir).toBe(true)
  })

  it('does not flag isInOverrideDir for normal paths', async () => {
    const fs = new MemoryFs({
      'mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const result = await scan('mod', stellarisDef, fs)
    expect(result.files[0]?.isInOverrideDir).toBe(false)
  })

  it('skips .yml files outside the localisation directory', async () => {
    const fs = new MemoryFs({
      'mod/common/some.yml': 'not a locale file',
      'mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const result = await scan('mod', stellarisDef, fs)
    expect(result.files).toHaveLength(1)
  })

  it('skips non-.yml files', async () => {
    const fs = new MemoryFs({
      'mod/localisation/english/readme.txt': 'hello',
      'mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const result = await scan('mod', stellarisDef, fs)
    expect(result.files).toHaveLength(1)
  })

  it('reports diagnostic for unknown language tokens', async () => {
    const fs = new MemoryFs({
      'mod/localisation/foo_l_klingon.yml': 'l_klingon:\n'
    })
    const result = await scan('mod', stellarisDef, fs)
    expect(result.files).toHaveLength(0)
    expect(result.diagnostics.some(d => d.includes('klingon'))).toBe(true)
  })

  it('reports diagnostic for filenames without language suffix', async () => {
    const fs = new MemoryFs({
      'mod/localisation/notalocale.yml': ''
    })
    const result = await scan('mod', stellarisDef, fs)
    expect(result.diagnostics.some(d => d.includes('Cannot parse filename'))).toBe(true)
  })

  it('walks multiple mods under the same root', async () => {
    const fs = new MemoryFs({
      'workshop/mod1/localisation/english/a_l_english.yml': localeFile('english'),
      'workshop/mod2/localisation/english/b_l_english.yml': localeFile('english'),
      'workshop/mod3/localisation/english/c_l_english.yml': localeFile('english')
    })
    const result = await scan('workshop', stellarisDef, fs)
    expect(result.files).toHaveLength(3)
    const modRoots = new Set(result.files.map(f => f.modRoot))
    expect(modRoots.size).toBe(3)
  })

  it('skips symlinked entries with a diagnostic', async () => {
    const fs = new MemoryFs({
      'mod/localisation/english/legit_l_english.yml': localeFile('english'),
      'mod/localisation/evil/cmd_l_english.yml': localeFile('english')
    })
    fs.seedSymlink('mod/localisation/evil')
    const result = await scan('mod', stellarisDef, fs)

    expect(result.files).toHaveLength(1)
    expect(result.files[0]?.relativePath).toBe('localisation/english/legit_l_english.yml')
    expect(result.diagnostics.some(d => d.includes('symlink'))).toBe(true)
  })

  it('builds canonicalKey that abstracts over language', async () => {
    const fs = new MemoryFs({
      'mod/localisation/english/foo_l_english.yml': localeFile('english'),
      'mod/localisation/french/foo_l_french.yml': localeFile('french')
    })
    const result = await scan('mod', stellarisDef, fs)
    const keys = result.files.map(f => f.canonicalKey)
    expect(new Set(keys).size).toBe(1)
    expect(keys[0]).toBe('localisation/{LANG}/foo_l_{LANG}.yml')
  })
})

describe('scan - nested localisation folders', () => {
  it('anchors on the deepest localisation folder', async () => {
    // Some mods ship a second localisation folder below the first one. The path below the
    // deepest one is what identifies the file, so the shallowest must not win.
    const fs = new MemoryFs({
      'mod/localisation/extra/localisation/foo_l_english.yml': localeFile('english')
    })
    const result = await scan('mod', stellarisDef, fs)
    expect(result.files).toHaveLength(1)
    expect(result.files[0]?.modRoot).toBe('mod/localisation/extra')
    expect(result.files[0]?.relativePath).toBe('localisation/foo_l_english.yml')
  })

  it('still anchors on the only localisation folder when there is one', async () => {
    const fs = new MemoryFs({
      'mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const result = await scan('mod', stellarisDef, fs)
    expect(result.files[0]?.modRoot).toBe('mod')
    expect(result.files[0]?.relativePath).toBe('localisation/english/foo_l_english.yml')
  })
})

describe('scan - absolute roots', () => {
  // The renderer's folder dialog hands over an absolute path, so this is the real-world case
  // on macOS and Linux. Rebuilding modRoot by joining segments used to drop the leading
  // separator, which sent every generated file to the process cwd.
  it('keeps modRoot absolute', async () => {
    const fs = new MemoryFs({
      '/Users/x/mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const result = await scan('/Users/x', stellarisDef, fs)
    expect(result.files).toHaveLength(1)
    expect(result.files[0]?.modRoot).toBe('/Users/x/mod')
    expect(result.files[0]?.absolutePath).toBe(
      '/Users/x/mod/localisation/english/foo_l_english.yml'
    )
  })

  it('keeps relativePath relative to the localisation folder', async () => {
    const fs = new MemoryFs({
      '/Users/x/mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const result = await scan('/Users/x', stellarisDef, fs)
    expect(result.files[0]?.relativePath).toBe('localisation/english/foo_l_english.yml')
  })

  it('keeps modRoot absolute when anchoring on a nested localisation folder', async () => {
    const fs = new MemoryFs({
      '/Users/x/mod/localisation/extra/localisation/foo_l_english.yml': localeFile('english')
    })
    const result = await scan('/Users/x', stellarisDef, fs)
    expect(result.files[0]?.modRoot).toBe('/Users/x/mod/localisation/extra')
    expect(result.files[0]?.relativePath).toBe('localisation/foo_l_english.yml')
  })

  it('keeps a Windows drive root intact', async () => {
    const fs = new MemoryFs({
      'C:/Users/x/mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const result = await scan('C:/Users/x', stellarisDef, fs)
    expect(result.files[0]?.modRoot).toBe('C:/Users/x/mod')
  })

  it('keeps distinct absolute mod roots distinct', async () => {
    const fs = new MemoryFs({
      '/Users/x/mod1/localisation/english/a_l_english.yml': localeFile('english'),
      '/Users/x/mod2/localisation/english/b_l_english.yml': localeFile('english')
    })
    const result = await scan('/Users/x', stellarisDef, fs)
    expect(result.files.map(f => f.modRoot).toSorted()).toEqual(['/Users/x/mod1', '/Users/x/mod2'])
  })
})
