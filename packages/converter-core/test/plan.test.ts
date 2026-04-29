import { describe, expect, it } from 'vitest'

import { diff } from '../src/diff.js'
import { plan } from '../src/plan.js'
import { scan } from '../src/scan.js'
import { localeFile, stellarisDef } from './fixtures.js'
import { MemoryFs } from './memory-fs.js'

async function setup(files: Record<string, string>) {
  const fs = new MemoryFs(files)
  const scanResult = await scan('workshop', stellarisDef, fs)
  return { fs, scanResult }
}

describe('plan - add-to-current mode', () => {
  it('rewrites the language in both the dir and filename', async () => {
    const { scanResult } = await setup({
      'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const diffPlan = diff(scanResult, 'en', ['fr'])
    const result = plan(diffPlan, { mode: 'add-to-current', gameDef: stellarisDef })
    expect(result.actions).toHaveLength(1)
    expect(result.actions[0]?.targetPath).toBe('workshop/mod/localisation/french/foo_l_french.yml')
  })

  it('handles flat layout (no language directory)', async () => {
    const { scanResult } = await setup({
      'workshop/mod/localisation/foo_l_english.yml': localeFile('english')
    })
    const diffPlan = diff(scanResult, 'en', ['fr'])
    const result = plan(diffPlan, { mode: 'add-to-current', gameDef: stellarisDef })
    expect(result.actions[0]?.targetPath).toBe('workshop/mod/localisation/foo_l_french.yml')
  })

  it('uses simp_chinese token for zh-Hans target', async () => {
    const { scanResult } = await setup({
      'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const diffPlan = diff(scanResult, 'en', ['zh-Hans'])
    const result = plan(diffPlan, { mode: 'add-to-current', gameDef: stellarisDef })
    expect(result.actions[0]?.targetPath).toBe(
      'workshop/mod/localisation/simp_chinese/foo_l_simp_chinese.yml'
    )
    expect(result.actions[0]?.targetLanguageToken).toBe('simp_chinese')
  })

  it('does NOT corrupt mod folder names that contain language substrings', async () => {
    // The v2 bug: replaceAll('english', 'french') on 'englishtutor_mod/localisation/english/foo_l_english.yml'
    // would produce 'frenchtutor_mod/localisation/french/foo_l_french.yml' - wrong mod root.
    const { scanResult } = await setup({
      'workshop/englishtutor_mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const diffPlan = diff(scanResult, 'en', ['fr'])
    const result = plan(diffPlan, { mode: 'add-to-current', gameDef: stellarisDef })
    expect(result.actions[0]?.targetPath).toBe(
      'workshop/englishtutor_mod/localisation/french/foo_l_french.yml'
    )
  })

  it('emits one action per missing file', async () => {
    const { scanResult } = await setup({
      'workshop/mod/localisation/english/a_l_english.yml': localeFile('english'),
      'workshop/mod/localisation/english/b_l_english.yml': localeFile('english'),
      'workshop/mod/localisation/english/c_l_english.yml': localeFile('english')
    })
    const diffPlan = diff(scanResult, 'en', ['fr', 'de'])
    const result = plan(diffPlan, { mode: 'add-to-current', gameDef: stellarisDef })
    expect(result.actions).toHaveLength(6)
  })
})

describe('plan - extract-to-folder mode', () => {
  it('writes under outputDir/<modName>/...', async () => {
    const { scanResult } = await setup({
      'workshop/mymod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const diffPlan = diff(scanResult, 'en', ['fr'])
    const result = plan(diffPlan, {
      mode: 'extract-to-folder',
      outputDir: '/output',
      gameDef: stellarisDef
    })
    expect(result.actions[0]?.targetPath).toBe('/output/mymod/localisation/french/foo_l_french.yml')
  })

  it('falls back to add-to-current behavior when outputDir is undefined', async () => {
    const { scanResult } = await setup({
      'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const diffPlan = diff(scanResult, 'en', ['fr'])
    const result = plan(diffPlan, { mode: 'extract-to-folder', gameDef: stellarisDef })
    expect(result.actions[0]?.targetPath).toBe('workshop/mod/localisation/french/foo_l_french.yml')
  })

  it('refuses when two distinct mod roots share the same basename', async () => {
    const { scanResult } = await setup({
      'workshop/A/mymod/localisation/english/foo_l_english.yml': localeFile('english'),
      'workshop/B/mymod/localisation/english/bar_l_english.yml': localeFile('english')
    })
    const diffPlan = diff(scanResult, 'en', ['fr'])
    expect(() =>
      plan(diffPlan, {
        mode: 'extract-to-folder',
        outputDir: '/output',
        gameDef: stellarisDef
      })
    ).toThrow(/same basename/)
  })

  it('does not refuse when both mod roots are actually the same path', async () => {
    const { scanResult } = await setup({
      'workshop/mymod/localisation/english/foo_l_english.yml': localeFile('english'),
      'workshop/mymod/localisation/english/bar_l_english.yml': localeFile('english')
    })
    const diffPlan = diff(scanResult, 'en', ['fr'])
    const result = plan(diffPlan, {
      mode: 'extract-to-folder',
      outputDir: '/output',
      gameDef: stellarisDef
    })
    expect(result.actions).toHaveLength(2)
  })
})

describe('plan - path traversal defence', () => {
  it('throws when a discovered relativePath contains .. segments', () => {
    const tamperedDiff = {
      sourceLanguage: 'en' as const,
      targetLanguages: ['fr' as const],
      missingFiles: {
        fr: [
          {
            absolutePath: 'workshop/mod/localisation/english/foo_l_english.yml',
            relativePath: 'localisation/../../etc/foo_l_english.yml',
            modRoot: 'workshop/mod',
            language: 'en' as const,
            languageToken: 'english',
            canonicalKey: 'localisation/../../etc/foo_l_{LANG}.yml',
            isInOverrideDir: false
          }
        ]
      }
    }
    expect(() => plan(tamperedDiff, { mode: 'add-to-current', gameDef: stellarisDef })).toThrow(
      /traversal/
    )
  })
})

describe('plan - error handling', () => {
  it('throws when source language has no token mapping', async () => {
    const { scanResult } = await setup({
      'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const diffPlan = diff(scanResult, 'en', ['fr'])
    const badGame = {
      ...stellarisDef,
      languageFileToken: { fr: 'french' }
    }
    expect(() => plan(diffPlan, { mode: 'add-to-current', gameDef: badGame })).toThrow()
  })

  it('skips target languages that lack a token mapping', async () => {
    const { scanResult } = await setup({
      'workshop/mod/localisation/english/foo_l_english.yml': localeFile('english')
    })
    const diffPlan = diff(scanResult, 'en', ['fr'])
    const partialGame = {
      ...stellarisDef,
      languageFileToken: { en: 'english' }
    }
    const result = plan(diffPlan, { mode: 'add-to-current', gameDef: partialGame })
    expect(result.actions).toHaveLength(0)
  })
})
