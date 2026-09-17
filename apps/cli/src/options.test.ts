import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ck3, eu4, stellaris } from '@ptt/games'
import type { TranslateConfig } from '@ptt/translate'
import { TRANSLATE_DEFAULTS } from '@ptt/translate'

import { parseArgs } from './args.js'
import { readConfig } from './config.js'
import {
  buildOptions,
  findUnsupportedTarget,
  parseSourceLanguage,
  parseTargets
} from './options.js'

const build = (argv: string[]): ReturnType<typeof buildOptions> => buildOptions(parseArgs(argv))

describe('parseSourceLanguage', () => {
  it('reads a plain code', () => {
    expect(parseSourceLanguage(ck3, 'ru')).toBe('ru')
  })

  it('trims', () => {
    expect(parseSourceLanguage(ck3, ' ru ')).toBe('ru')
  })

  it('refuses a code that is not a LanguageCode', () => {
    expect(() => parseSourceLanguage(ck3, 'klingon')).toThrow(/Unknown language "klingon"/)
  })

  it('refuses a language the selected game has no localisation for', () => {
    expect(() => parseSourceLanguage(stellaris, 'tr')).toThrow(/no localisation for "tr"/)
  })

  it('rejects a code:token spec: the source is always one the game ships', () => {
    expect(() => parseSourceLanguage(ck3, 'en:english')).toThrow(/no token to pick/)
  })
})

describe('parseTargets', () => {
  it('reads one built-in code', () => {
    expect(parseTargets(ck3, 'ru')).toEqual([{ language: 'ru', fileToken: 'russian' }])
  })

  it("reads several, keeping the order and each one's own token", () => {
    expect(parseTargets(stellaris, 'ru,fr,de')).toEqual([
      { language: 'ru', fileToken: 'russian' },
      { language: 'fr', fileToken: 'french' },
      { language: 'de', fileToken: 'german' }
    ])
  })

  it('trims and ignores blanks', () => {
    expect(parseTargets(ck3, ' ru , , fr ')).toEqual([
      { language: 'ru', fileToken: 'russian' },
      { language: 'fr', fileToken: 'french' }
    ])
  })

  it('reads a custom code:token pair, normalizing the token', () => {
    expect(parseTargets(stellaris, 'tr:ENGLISH')).toEqual([
      { language: 'tr', fileToken: 'english' }
    ])
  })

  it('recognizes a language by its display name, not only its code', () => {
    expect(parseTargets(stellaris, 'Russian')).toEqual([{ language: 'ru', fileToken: 'russian' }])
  })

  it('is case- and whitespace-insensitive when recognizing a code', () => {
    expect(parseTargets(stellaris, ' TR :english')).toEqual([
      { language: 'tr', fileToken: 'english' }
    ])
  })

  it('accepts a free-text language that matches no built-in code', () => {
    expect(parseTargets(stellaris, 'Catalan:english')).toEqual([
      { language: 'Catalan', fileToken: 'english' }
    ])
  })

  it('rejects a free-text language with no token: it is not one the game ships a file name for', () => {
    expect(() => parseTargets(stellaris, 'Catalan')).toThrow(
      /"Catalan" is not a language Stellaris ships a file name for.*"Catalan:<token>"/s
    )
  })

  it('rejects a mistyped code with no token instead of writing it under the source token', () => {
    expect(() => parseTargets(ck3, 'tr2')).toThrow(
      /"tr2" is not a language .* ships a file name for/
    )
  })

  it('refuses a built-in code the game has no localisation for, suggesting code:token', () => {
    expect(() => parseTargets(stellaris, 'tr')).toThrow(
      /"tr" is not a language Stellaris ships a file name for.*"tr:<token>"/s
    )
  })

  it('refuses an invalid custom token', () => {
    expect(() => parseTargets(stellaris, 'tr:A_l_b')).toThrow(/Invalid file token "A_l_b"/)
  })

  it('refuses a token the game does not declare for any language', () => {
    expect(() => parseTargets(ck3, 'tr:turkish')).toThrow(/Crusader Kings III writes no l_turkish/)
  })

  it('refuses a token declared by a game with few of them, listing what it does declare', () => {
    expect(() => parseTargets(eu4, 'tr:turkish')).toThrow(/expected one of english, french/)
  })

  it('refuses a duplicate target language', () => {
    expect(() => parseTargets(stellaris, 'tr:english,tr:french')).toThrow(/given more than once/)
  })

  it('refuses two spellings of the same target language', () => {
    expect(() => parseTargets(stellaris, 'tr:english,Turkish:french')).toThrow(
      /given more than once/
    )
  })

  it('refuses a duplicate target token', () => {
    expect(() => parseTargets(stellaris, 'tr:english,ja:english')).toThrow(/given more than once/)
  })

  it('does not reject a target equal to the source: resolveTargets drops it downstream', () => {
    expect(parseTargets(ck3, 'en')).toEqual([{ language: 'en', fileToken: 'english' }])
  })

  it('refuses an empty list', () => {
    expect(() => parseTargets(ck3, ' , ')).toThrow(/No target given/)
  })

  it('splits "a,b:english" on the comma, so the language part alone must resolve', () => {
    expect(() => parseTargets(stellaris, 'a,b:english')).toThrow(
      /"a" is not a language Stellaris ships a file name for/
    )
  })

  it('splits "a:b:english" on the first colon, so the rest is one invalid token', () => {
    expect(() => parseTargets(stellaris, 'a:b:english')).toThrow(/Invalid file token "b:english"/)
  })

  it('allows a shadowing custom target: resolveTargets and the pipeline decide what it does', () => {
    expect(parseTargets(stellaris, 'tr:english')).toEqual([
      { language: 'tr', fileToken: 'english' }
    ])
    expect(parseTargets(stellaris, 'Catalan:english')).toEqual([
      { language: 'Catalan', fileToken: 'english' }
    ])
  })
})

const translateConfig = (provider: 'openai' | 'rapidapi'): TranslateConfig => ({
  enabled: true,
  provider,
  baseUrl: '',
  model: '',
  batchSize: 1,
  concurrency: 1,
  retries: 1,
  timeout: 1000
})

describe('findUnsupportedTarget', () => {
  const targets = [{ language: 'Catalan', fileToken: 'english' }]

  it('is undefined when translation is off', () => {
    expect(findUnsupportedTarget(undefined, targets)).toBeUndefined()
  })

  it('is undefined for a provider other than rapidapi', () => {
    expect(findUnsupportedTarget(translateConfig('openai'), targets)).toBeUndefined()
  })

  it('finds the first unrecognized target for rapidapi', () => {
    expect(findUnsupportedTarget(translateConfig('rapidapi'), targets)).toEqual(targets[0])
  })

  it('is undefined for rapidapi when every target is a built-in code', () => {
    const translate = translateConfig('rapidapi')
    expect(
      findUnsupportedTarget(translate, [{ language: 'tr', fileToken: 'turkish' }])
    ).toBeUndefined()
  })
})

describe('buildOptions - required flags', () => {
  it('requires --path for the commands that read mods', async () => {
    await expect(build(['scan'])).rejects.toThrow(/--path is required/)
    await expect(build(['audit'])).rejects.toThrow(/--path is required/)
    await expect(build(['convert'])).rejects.toThrow(/--path is required/)
  })

  it('does not require --path for the commands that only read app data', async () => {
    await expect(build(['memory'])).resolves.not.toThrow()
    await expect(build(['reports'])).resolves.not.toThrow()
  })
})

describe('buildOptions - games and modes', () => {
  it('defaults to ck3', async () => {
    expect((await build(['memory'])).game.id).toBe('ck3')
  })

  it('reads a registered game', async () => {
    expect((await build(['memory', '--game', 'stellaris'])).game.id).toBe('stellaris')
  })

  it('refuses a game the registry does not know', async () => {
    await expect(build(['memory', '--game', 'victoria-2'])).rejects.toThrow(/Unknown game/)
  })

  it('maps the short mode names', async () => {
    expect((await build(['memory', '--mode', 'mod'])).mode).toBe('create-translation-mod')
    expect((await build(['memory', '--mode', 'add'])).mode).toBe('add-to-current')
    expect((await build(['memory', '--mode', 'extract'])).mode).toBe('extract-to-folder')
  })

  it('accepts the full mode name too', async () => {
    expect((await build(['memory', '--mode', 'add-to-current'])).mode).toBe('add-to-current')
  })

  it('defaults to the generated translation mod', async () => {
    expect((await build(['memory'])).mode).toBe('create-translation-mod')
  })

  it('refuses an unknown mode', async () => {
    await expect(build(['memory', '--mode', 'delete'])).rejects.toThrow(/Unknown --mode/)
  })
})

describe('buildOptions - targets', () => {
  it('defaults --to to ru', async () => {
    expect((await build(['memory'])).targets).toEqual([{ language: 'ru', fileToken: 'russian' }])
  })

  it('reads a custom code:token target', async () => {
    expect((await build(['memory', '--game', 'stellaris', '--to', 'tr:english'])).targets).toEqual([
      { language: 'tr', fileToken: 'english' }
    ])
  })

  it('refuses a --to list resolveTargets drops entirely, instead of a silent zero-work run', async () => {
    await expect(
      build(['memory', '--game', 'stellaris', '--from', 'en', '--to', 'English:french'])
    ).rejects.toThrow(/would write nothing.*source language/s)
  })

  it('accepts a shadowing custom target combined with --mode add, with content complete-file', async () => {
    expect(
      (
        await build([
          'memory',
          '--game',
          'stellaris',
          '--to',
          'tr:english',
          '--mode',
          'add',
          '--content',
          'complete'
        ])
      ).targets
    ).toEqual([{ language: 'tr', fileToken: 'english' }])
  })

  it('rejects a shadowing custom target combined with --mode add on the source token, missing-keys', async () => {
    await expect(
      build([
        'memory',
        '--game',
        'stellaris',
        '--to',
        'tr:english',
        '--mode',
        'add',
        '--content',
        'missing'
      ])
    ).rejects.toThrow(/l_english is already how this mod is written/)
  })

  it('accepts the same shadowing target in add-to-current when it targets another token', async () => {
    expect(
      (
        await build([
          'memory',
          '--game',
          'stellaris',
          '--to',
          'tr:french',
          '--mode',
          'add',
          '--content',
          'missing'
        ])
      ).targets
    ).toEqual([{ language: 'tr', fileToken: 'french' }])
  })

  it('rejects --from with a code:token spec', async () => {
    await expect(build(['memory', '--from', 'en:english'])).rejects.toThrow(/no token to pick/)
  })

  it('rejects an unrecognized language with rapidapi', async () => {
    await expect(
      build([
        'memory',
        '--game',
        'stellaris',
        '--to',
        'Catalan:english',
        '--translate',
        '--provider',
        'rapidapi'
      ])
    ).rejects.toThrow(/RapidAPI provider cannot translate into "Catalan"/)
  })

  it('accepts the same unrecognized language with a provider other than rapidapi', async () => {
    expect(
      (
        await build([
          'memory',
          '--game',
          'stellaris',
          '--to',
          'Catalan:english',
          '--translate',
          '--provider',
          'openai'
        ])
      ).targets
    ).toEqual([{ language: 'Catalan', fileToken: 'english' }])
  })
})

describe('buildOptions - target content', () => {
  it('defaults to missing-keys when --content is absent', async () => {
    expect((await build(['memory'])).targetContent).toBe('missing-keys')
  })

  it('maps the short content names', async () => {
    expect((await build(['memory', '--content', 'missing'])).targetContent).toBe('missing-keys')
    expect((await build(['memory', '--content', 'complete'])).targetContent).toBe(
      'complete-file'
    )
    expect((await build(['memory', '--content', 'regenerate'])).targetContent).toBe(
      'regenerate-file'
    )
  })

  it('accepts the full content name too', async () => {
    expect((await build(['memory', '--content', 'missing-keys'])).targetContent).toBe(
      'missing-keys'
    )
    expect((await build(['memory', '--content', 'complete-file'])).targetContent).toBe(
      'complete-file'
    )
    expect((await build(['memory', '--content', 'regenerate-file'])).targetContent).toBe(
      'regenerate-file'
    )
  })

  it('refuses an unknown content value, naming the accepted ones', async () => {
    await expect(build(['memory', '--content', 'wipe'])).rejects.toThrow(
      /Unknown --content "wipe", expected one of missing, complete, regenerate/
    )
  })
})

describe('buildOptions - translation', () => {
  it('is off unless asked for', async () => {
    expect((await build(['memory'])).translate).toBeUndefined()
  })

  it('uses the shared defaults, so the UI and the CLI cannot drift', async () => {
    const translate = (await build(['memory', '--translate'])).translate
    expect(translate?.concurrency).toBe(TRANSLATE_DEFAULTS.concurrency)
    expect(translate?.timeout).toBe(TRANSLATE_DEFAULTS.timeout)
    expect(translate?.batchSize).toBe(TRANSLATE_DEFAULTS.batchSize)
  })

  it('carries the game description, which is what stops a trait becoming a common noun', async () => {
    expect(
      (await build(['memory', '--translate', '--game', 'ck3'])).translate?.domain
    ).toContain('Crusader Kings III')
  })

  it('refuses an unknown provider', async () => {
    await expect(build(['memory', '--translate', '--provider', 'deepl'])).rejects.toThrow(
      /Unknown --provider/
    )
  })

  it('takes the endpoint and model of the chosen provider by default', async () => {
    const translate = (await build(['memory', '--translate', '--provider', 'openai'])).translate
    expect(translate?.baseUrl).toContain('openai.com')
  })

  it('reads the key from the environment, which keeps it out of the shell history', async () => {
    process.env.PTT_API_KEY = 'sk-from-env'
    try {
      expect((await build(['memory', '--translate'])).translate?.apiKey).toBe('sk-from-env')
    } finally {
      delete process.env.PTT_API_KEY
    }
  })

  it('lets an explicit flag win over the environment', async () => {
    process.env.PTT_API_KEY = 'sk-from-env'
    try {
      expect(
        (await build(['memory', '--translate', '--api-key', 'sk-flag'])).translate?.apiKey
      ).toBe('sk-flag')
    } finally {
      delete process.env.PTT_API_KEY
    }
  })
})

describe('buildOptions - config file', () => {
  let dir = ''
  let cwd = ''

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ptt-cli-'))
    cwd = process.cwd()
    process.chdir(dir)
  })

  afterEach(() => {
    process.chdir(cwd)
    rmSync(dir, { recursive: true, force: true })
  })

  it('reads ptt.config.json from the working directory', async () => {
    writeFileSync(join(dir, 'ptt.config.json'), JSON.stringify({ game: 'stellaris', limit: 5 }))
    const options = await build(['memory'])
    expect(options.game.id).toBe('stellaris')
    expect(options.limit).toBe(5)
  })

  it('honours a numeric value from the config file', async () => {
    writeFileSync(join(dir, 'ptt.config.json'), JSON.stringify({ translate: true, batch: 150 }))
    expect((await build(['memory'])).translate?.batchSize).toBe(150)
  })

  it('lets a command line flag beat the config file', async () => {
    writeFileSync(join(dir, 'ptt.config.json'), JSON.stringify({ limit: 5 }))
    expect((await build(['memory', '--limit', '99'])).limit).toBe(99)
  })

  it('is happy with no config file at all', async () => {
    await expect(build(['memory'])).resolves.not.toThrow()
  })

  it('stops on an explicit --config that cannot be read', async () => {
    await expect(build(['memory', '--config', 'nope.json'])).rejects.toThrow(
      /Cannot read nope.json/
    )
  })

  it('stops on a config file that is not JSON', () => {
    writeFileSync(join(dir, 'ptt.config.json'), '{ truncated')
    expect(() => readConfig()).toThrow(/not valid JSON/)
  })

  it('stops on a config file holding a nested object, which no flag can be', () => {
    writeFileSync(join(dir, 'ptt.config.json'), JSON.stringify({ translate: { enabled: true } }))
    expect(() => readConfig()).toThrow(/must be a string, a number or a boolean/)
  })

  it('stops on a config file holding an array', () => {
    writeFileSync(join(dir, 'ptt.config.json'), '["a"]')
    expect(() => readConfig()).toThrow(/must hold a JSON object/)
  })
})

describe('buildOptions - outputs', () => {
  it('puts reports under the app data folder', async () => {
    expect((await build(['reports', '--user-data', '/data'])).reportsDir).toBe('/data/reports')
  })

  it('defaults the row limit', async () => {
    expect((await build(['memory'])).limit).toBe(30)
  })

  it('carries the selected mods as a list', async () => {
    expect((await build(['memory', '--mods', 'a, b'])).selectedMods).toEqual(['a', 'b'])
  })

  it('leaves the optional outputs unset when not asked for', async () => {
    const options = await build(['memory'])
    expect(options.jsonOut).toBeUndefined()
    expect(options.csvOut).toBeUndefined()
    expect(options.modFilter).toBeUndefined()
  })
})
