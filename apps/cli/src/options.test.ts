import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ck3, stellaris } from '@ptt/games'
import { TRANSLATE_DEFAULTS } from '@ptt/translate'

import { parseArgs } from './args.js'
import { readConfig } from './config.js'
import { buildOptions, parseLanguages } from './options.js'

const build = (argv: string[]): ReturnType<typeof buildOptions> => buildOptions(parseArgs(argv))

describe('parseLanguages', () => {
  it('reads one code', () => {
    expect(parseLanguages(ck3, 'ru')).toEqual(['ru'])
  })

  it('reads several, keeping the order', () => {
    expect(parseLanguages(stellaris, 'ru,fr,de')).toEqual(['ru', 'fr', 'de'])
  })

  it('trims and ignores blanks', () => {
    expect(parseLanguages(ck3, ' ru , , fr ')).toEqual(['ru', 'fr'])
  })

  it('refuses a code that is not a LanguageCode', () => {
    expect(() => parseLanguages(ck3, 'klingon')).toThrow(/Unknown language "klingon"/)
  })

  it('refuses a language the selected game has no localisation for', () => {
    expect(() => parseLanguages(stellaris, 'tr')).toThrow(/no localisation for "tr"/)
  })

  it('refuses an empty list', () => {
    expect(() => parseLanguages(ck3, ' , ')).toThrow(/No language given/)
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
