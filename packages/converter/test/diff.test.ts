import { describe, expect, it } from 'vitest'

import { diff } from '../src/diff.js'
import { scan } from '../src/scan.js'
import { localeFile, stellarisDef } from './fixtures.js'
import { MemoryFs } from './memory-fs.js'

describe('diff', () => {
  it('finds files missing in a single target language', async () => {
    const fs = new MemoryFs({
      'mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const scanResult = await scan('mod', stellarisDef, fs)
    const result = diff(scanResult, 'en', ['fr'])
    expect(result.missingFiles.fr).toHaveLength(1)
  })

  it('returns empty missing for languages already present', async () => {
    const fs = new MemoryFs({
      'mod/localisation/english/foo_l_english.yml': localeFile('english'),
      'mod/localisation/french/foo_l_french.yml': localeFile('french')
    })
    const scanResult = await scan('mod', stellarisDef, fs)
    const result = diff(scanResult, 'en', ['fr'])
    expect(result.missingFiles.fr).toBeUndefined()
  })

  it('handles multiple target languages independently', async () => {
    const fs = new MemoryFs({
      'mod/localisation/english/foo_l_english.yml': localeFile('english'),
      'mod/localisation/french/foo_l_french.yml': localeFile('french')
    })
    const scanResult = await scan('mod', stellarisDef, fs)
    const result = diff(scanResult, 'en', ['fr', 'de'])
    expect(result.missingFiles.fr).toBeUndefined()
    expect(result.missingFiles.de).toHaveLength(1)
  })

  it('skips the source language when listed as a target', async () => {
    const fs = new MemoryFs({
      'mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const scanResult = await scan('mod', stellarisDef, fs)
    const result = diff(scanResult, 'en', ['en', 'fr'])
    expect(result.missingFiles.en).toBeUndefined()
    expect(result.missingFiles.fr).toHaveLength(1)
  })

  it('translates files in override directories independently from regular files', async () => {
    const fs = new MemoryFs({
      'mod/localisation/replace/foo_l_english.yml': localeFile('english')
    })
    const scanResult = await scan('mod', stellarisDef, fs)
    const result = diff(scanResult, 'en', ['fr'])
    expect(result.missingFiles.fr).toHaveLength(1)
    expect(result.missingFiles.fr?.[0]?.relativePath).toBe('localisation/replace/foo_l_english.yml')
  })

  it('does not let an override-language file count as presence for the regular file', async () => {
    const fs = new MemoryFs({
      'mod/localisation/english/foo_l_english.yml': localeFile('english'),
      'mod/localisation/replace/foo_l_french.yml': localeFile('french')
    })
    const scanResult = await scan('mod', stellarisDef, fs)
    const result = diff(scanResult, 'en', ['fr'])
    expect(result.missingFiles.fr).toHaveLength(1)
    expect(result.missingFiles.fr?.[0]?.relativePath).toBe('localisation/english/foo_l_english.yml')
  })

  it('treats different mods as independent (does not cross-fill)', async () => {
    const fs = new MemoryFs({
      'workshop/mod1/localisation/english/a_l_english.yml': localeFile('english'),
      'workshop/mod2/localisation/french/a_l_french.yml': localeFile('french')
    })
    const scanResult = await scan('workshop', stellarisDef, fs)
    const result = diff(scanResult, 'en', ['fr'])
    expect(result.missingFiles.fr).toHaveLength(1)
    expect(result.missingFiles.fr?.[0]?.modRoot).toBe('workshop/mod1')
  })

  it('with overwrite=true, lists every source file even if the target already exists', async () => {
    const fs = new MemoryFs({
      'mod/localisation/english/foo_l_english.yml': localeFile('english'),
      'mod/localisation/french/foo_l_french.yml': localeFile('french')
    })
    const scanResult = await scan('mod', stellarisDef, fs)
    const result = diff(scanResult, 'en', ['fr'], { overwrite: true })
    expect(result.missingFiles.fr).toHaveLength(1)
  })

  it('returns empty diff when there are no source-language files', async () => {
    const fs = new MemoryFs({
      'mod/localisation/french/foo_l_french.yml': localeFile('french')
    })
    const scanResult = await scan('mod', stellarisDef, fs)
    const result = diff(scanResult, 'en', ['de'])
    expect(result.missingFiles.de).toBeUndefined()
  })
})
