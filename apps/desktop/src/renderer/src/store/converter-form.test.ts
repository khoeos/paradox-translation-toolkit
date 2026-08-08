import { beforeEach, describe, expect, it } from 'vitest'

import type { ScannedMod } from '@ptt/converter-core'
import { PROVIDER_DEFAULTS, TRANSLATE_DEFAULTS } from '@ptt/translate-core/defaults'

import {
  canConvertSelection,
  canRun,
  runTranslateConfig,
  useConverterFormStore
} from './converter-form.js'

const mod = (over: Partial<ScannedMod> = {}): ScannedMod => ({
  id: 'mymod',
  name: 'My Mod',
  path: 'workshop/mymod',
  localisationFiles: 1,
  sourceFiles: 1,
  sourceKeys: 3,
  otherSpelling: false,
  coveredBy: [],
  missing: {},
  missingKeys: {},
  coveredKeys: {},
  englishKeys: {},
  keptKeys: {},
  shadowedKeys: {},
  missingFiles: 1,
  missingLines: 0,
  errors: [],
  ...over
})

const state = (): ReturnType<typeof useConverterFormStore.getState> =>
  useConverterFormStore.getState()

beforeEach(() => {
  state().reset()
  state().setGame('stellaris')
})

describe('scan invalidation', () => {
  // A scan result describes one folder, one game and one set of languages. Once any of those
  // changes the list on screen is a lie, so it goes rather than sitting there looking valid.
  const seed = (): void => {
    state().setModFolder('workshop')
    state().setScannedMods([mod()])
    expect(state().scannedMods).toHaveLength(1)
  }

  it('drops the scan when the mod folder changes', () => {
    seed()
    state().setModFolder('elsewhere')
    expect(state().scannedMods).toEqual([])
    expect(state().selectedMods.size).toBe(0)
  })

  it('drops the scan when the game changes', () => {
    seed()
    state().setGame('ck3')
    expect(state().scannedMods).toEqual([])
  })

  it('drops the scan when a target language is toggled', () => {
    seed()
    state().toggleTargetLanguage('ru')
    expect(state().scannedMods).toEqual([])
  })

  it('drops the scan when the source language changes', () => {
    seed()
    state().setSourceLanguage('fr')
    expect(state().scannedMods).toEqual([])
  })

  it('drops the scan when a game snapshot is loaded', () => {
    seed()
    state().loadGame('stellaris', {
      modFolder: 'workshop',
      outputFolder: '',
      sourceLanguage: 'en',
      targetLanguages: ['ru']
    })
    expect(state().scannedMods).toEqual([])
  })

  it('keeps the scan when only the mod name changes, which no scan depends on', () => {
    seed()
    state().setModName('My Pack')
    expect(state().scannedMods).toHaveLength(1)
  })
})

describe('mod selection', () => {
  it('ticks everything with work to do, which is what the user came for', () => {
    state().setScannedMods([
      mod({ id: 'a', missingFiles: 2 }),
      mod({ id: 'b', missingFiles: 0 }),
      mod({ id: 'c', missingFiles: 1 })
    ])
    expect([...state().selectedMods].toSorted()).toEqual(['a', 'c'])
  })

  it('toggles one mod', () => {
    state().setScannedMods([mod({ id: 'a', missingFiles: 1 })])
    state().toggleMod('a')
    expect(state().selectedMods.has('a')).toBe(false)
    state().toggleMod('a')
    expect(state().selectedMods.has('a')).toBe(true)
  })

  it('replaces the whole selection', () => {
    state().setScannedMods([mod({ id: 'a' }), mod({ id: 'b' })])
    state().setSelectedMods(['b'])
    expect([...state().selectedMods]).toEqual(['b'])
  })
})

describe('provider switching', () => {
  it('replaces an untouched default endpoint', () => {
    state().setTranslateProvider('openai')
    expect(state().translate.baseUrl).toBe(PROVIDER_DEFAULTS.openai.baseUrl)
  })

  it('never overwrites an endpoint the user typed', () => {
    state().setTranslate({ baseUrl: 'https://my-gateway.internal/v1' })
    state().setTranslateProvider('openai')
    expect(state().translate.baseUrl).toBe('https://my-gateway.internal/v1')
  })

  it('never overwrites a model the user typed', () => {
    state().setTranslate({ model: 'my-finetune:v3' })
    state().setTranslateProvider('openai')
    expect(state().translate.model).toBe('my-finetune:v3')
  })

  it('starts from the shared defaults', () => {
    expect(state().translate).toEqual(TRANSLATE_DEFAULTS)
  })
})

describe('the API key', () => {
  it('lives outside the persisted settings', () => {
    state().setApiKey('sk-secret')
    expect('apiKey' in state().translate).toBe(false)
    expect(JSON.stringify(state().translate)).not.toContain('sk-secret')
  })

  it('is put back only for the call that needs it', () => {
    state().setTranslate({ enabled: true })
    state().setApiKey('sk-secret')
    expect(runTranslateConfig(state())?.apiKey).toBe('sk-secret')
  })

  it('is left out when empty, rather than sent as an empty string', () => {
    state().setTranslate({ enabled: true })
    expect('apiKey' in (runTranslateConfig(state()) ?? {})).toBe(false)
  })

  it('is cleared by a reset', () => {
    state().setApiKey('sk-secret')
    state().reset()
    expect(state().apiKey).toBe('')
  })
})

describe('runTranslateConfig', () => {
  it('is undefined while translation is off, so no run reaches a backend by accident', () => {
    expect(runTranslateConfig(state())).toBeUndefined()
  })

  it('carries the settings once enabled', () => {
    state().setTranslate({ enabled: true, batchSize: 50 })
    expect(runTranslateConfig(state())?.batchSize).toBe(50)
  })
})

describe('canRun', () => {
  it('needs a game, a folder and a target language', () => {
    expect(canRun(state())).toBe(false)
    state().setModFolder('workshop')
    expect(canRun(state())).toBe(false)
    state().toggleTargetLanguage('ru')
    expect(canRun(state())).toBe(true)
  })

  it('needs an output folder in extract mode', () => {
    state().setModFolder('workshop')
    state().toggleTargetLanguage('ru')
    state().setMode('extract-to-folder')
    expect(canRun(state())).toBe(false)
    state().setOutputFolder('out')
    expect(canRun(state())).toBe(true)
  })
})

describe('canConvertSelection', () => {
  const ready = (): void => {
    state().setModFolder('workshop')
    state().toggleTargetLanguage('ru')
  }

  it('is the same as canRun for the file-level modes', () => {
    ready()
    state().setMode('add-to-current')
    expect(canConvertSelection(state())).toBe(true)
  })

  it('needs a scan before the generated mod can be written', () => {
    ready()
    state().setMode('create-translation-mod')
    expect(canConvertSelection(state())).toBe(false)
  })

  it('needs at least one mod ticked', () => {
    ready()
    state().setMode('create-translation-mod')
    state().setScannedMods([mod({ missingFiles: 0 })])
    expect(canConvertSelection(state())).toBe(false)
    state().setSelectedMods(['mymod'])
    expect(canConvertSelection(state())).toBe(true)
  })
})
