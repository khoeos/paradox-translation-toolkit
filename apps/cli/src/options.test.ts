import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ck3, stellaris } from '@ptt/game-registry'
import { TRANSLATE_DEFAULTS } from '@ptt/translate-core'

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
    // stellaris declares no Turkish token; the original cast blindly and produced undefined.
    expect(() => parseLanguages(stellaris, 'tr')).toThrow(/no localisation for "tr"/)
  })

  it('refuses an empty list', () => {
    expect(() => parseLanguages(ck3, ' , ')).toThrow(/No language given/)
  })
})

describe('buildOptions - required flags', () => {
  it('requires --path for the commands that read mods', () => {
    expect(() => build(['scan'])).toThrow(/--path is required/)
    expect(() => build(['audit'])).toThrow(/--path is required/)
    expect(() => build(['convert'])).toThrow(/--path is required/)
  })

  it('does not require --path for the commands that only read app data', () => {
    expect(() => build(['memory'])).not.toThrow()
    expect(() => build(['reports'])).not.toThrow()
  })
})

describe('buildOptions - games and modes', () => {
  it('defaults to ck3', () => {
    expect(build(['memory']).game.id).toBe('ck3')
  })

  it('reads a registered game', () => {
    expect(build(['memory', '--game', 'stellaris']).game.id).toBe('stellaris')
  })

  it('refuses a game the registry does not know', () => {
    expect(() => build(['memory', '--game', 'victoria-2'])).toThrow(/Unknown game/)
  })

  it('maps the short mode names', () => {
    expect(build(['memory', '--mode', 'mod']).mode).toBe('create-translation-mod')
    expect(build(['memory', '--mode', 'add']).mode).toBe('add-to-current')
    expect(build(['memory', '--mode', 'extract']).mode).toBe('extract-to-folder')
  })

  it('accepts the full mode name too', () => {
    expect(build(['memory', '--mode', 'add-to-current']).mode).toBe('add-to-current')
  })

  it('defaults to the generated translation mod', () => {
    expect(build(['memory']).mode).toBe('create-translation-mod')
  })

  it('refuses an unknown mode', () => {
    expect(() => build(['memory', '--mode', 'delete'])).toThrow(/Unknown --mode/)
  })
})

describe('buildOptions - translation', () => {
  it('is off unless asked for', () => {
    expect(build(['memory']).translate).toBeUndefined()
  })

  it('uses the shared defaults, so the UI and the CLI cannot drift', () => {
    const translate = build(['memory', '--translate']).translate
    expect(translate?.concurrency).toBe(TRANSLATE_DEFAULTS.concurrency)
    expect(translate?.timeout).toBe(TRANSLATE_DEFAULTS.timeout)
    expect(translate?.batchSize).toBe(TRANSLATE_DEFAULTS.batchSize)
  })

  it('carries the game description, which is what stops a trait becoming a common noun', () => {
    expect(build(['memory', '--translate', '--game', 'ck3']).translate?.domain).toContain(
      'Crusader Kings III'
    )
  })

  it('refuses an unknown provider', () => {
    expect(() => build(['memory', '--translate', '--provider', 'deepl'])).toThrow(
      /Unknown --provider/
    )
  })

  it('takes the endpoint and model of the chosen provider by default', () => {
    const translate = build(['memory', '--translate', '--provider', 'openai']).translate
    expect(translate?.baseUrl).toContain('openai.com')
  })

  it('reads the key from the environment, which keeps it out of the shell history', () => {
    process.env.PTT_API_KEY = 'sk-from-env'
    try {
      expect(build(['memory', '--translate']).translate?.apiKey).toBe('sk-from-env')
    } finally {
      delete process.env.PTT_API_KEY
    }
  })

  it('lets an explicit flag win over the environment', () => {
    process.env.PTT_API_KEY = 'sk-from-env'
    try {
      expect(build(['memory', '--translate', '--api-key', 'sk-flag']).translate?.apiKey).toBe(
        'sk-flag'
      )
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

  it('reads ptt.config.json from the working directory', () => {
    writeFileSync(join(dir, 'ptt.config.json'), JSON.stringify({ game: 'stellaris', limit: 5 }))
    const options = build(['memory'])
    expect(options.game.id).toBe('stellaris')
    expect(options.limit).toBe(5)
  })

  it('honours a numeric value from the config file', () => {
    // The original dropped it: every numeric setting went through a string-only guard.
    writeFileSync(join(dir, 'ptt.config.json'), JSON.stringify({ translate: true, batch: 150 }))
    expect(build(['memory']).translate?.batchSize).toBe(150)
  })

  it('lets a command line flag beat the config file', () => {
    writeFileSync(join(dir, 'ptt.config.json'), JSON.stringify({ limit: 5 }))
    expect(build(['memory', '--limit', '99']).limit).toBe(99)
  })

  it('is happy with no config file at all', () => {
    expect(() => build(['memory'])).not.toThrow()
  })

  it('stops on an explicit --config that cannot be read', () => {
    expect(() => build(['memory', '--config', 'nope.json'])).toThrow(/Cannot read nope.json/)
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
  it('puts reports under the app data folder', () => {
    expect(build(['reports', '--user-data', '/data']).reportsDir).toBe('/data/reports')
  })

  it('defaults the row limit', () => {
    expect(build(['memory']).limit).toBe(30)
  })

  it('carries the selected mods as a list', () => {
    expect(build(['memory', '--mods', 'a, b']).selectedMods).toEqual(['a', 'b'])
  })

  it('leaves the optional outputs unset when not asked for', () => {
    const options = build(['memory'])
    expect(options.jsonOut).toBeUndefined()
    expect(options.csvOut).toBeUndefined()
    expect(options.modFilter).toBeUndefined()
  })
})
