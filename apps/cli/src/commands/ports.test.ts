import { describe, expect, it } from 'vitest'

import { stellaris } from '@ptt/games'

import type { CliOptions } from '../options.js'
import { createRunPorts } from './ports.js'

const options = (over: Partial<CliOptions> = {}): CliOptions =>
  ({
    command: 'convert',
    rootDir: '/mods',
    game: stellaris,
    sourceLanguage: 'en',
    targets: [{ language: 'ru', fileToken: 'russian' }],
    mode: 'create-translation-mod',
    targetContent: 'missing-keys',
    retranslateOwnKeys: false,
    modName: 'Missing Translations',
    userDataPath: '/data',
    documentsPath: '/docs',
    reportsDir: '/data/reports',
    limit: 10,
    ...over
  }) as CliOptions

describe('createRunPorts', () => {
  it('always supplies both ports, so runConvert owns the sequence either way', () => {
    const ports = createRunPorts(options(), new AbortController().signal)
    expect(ports.translationSetup.open).toBeTypeOf('function')
    expect(ports.runReport.write).toBeTypeOf('function')
  })
})
