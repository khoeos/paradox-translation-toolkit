import { beforeEach, describe, expect, it } from 'vitest'

import type { ScannedMod } from '@ptt/converter'
import { PROVIDER_DEFAULTS, TRANSLATE_DEFAULTS } from '@ptt/translate/defaults'

import { canRun, runTranslateConfig, useConverterFormStore } from './converter-form.js'

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
    state().toggleTargetLanguage('ru', 'russian')
    expect(state().scannedMods).toEqual([])
  })

  it('drops the scan when a custom target is added', () => {
    seed()
    state().addCustomTarget({ language: 'tr', fileToken: 'english' })
    expect(state().scannedMods).toEqual([])
  })

  it('drops the scan when a target is removed', () => {
    state().addCustomTarget({ language: 'tr', fileToken: 'english' })
    seed()
    state().removeTarget('tr')
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
      targets: [{ language: 'ru', fileToken: 'russian' }],
      gamePath: ''
    })
    expect(state().scannedMods).toEqual([])
  })

  it('keeps the scan when only the mod name changes, which no scan depends on', () => {
    seed()
    state().setModName('My Pack')
    expect(state().scannedMods).toHaveLength(1)
  })

  it('drops the scan when retranslateOwnKeys is toggled', () => {
    seed()
    state().setRetranslateOwnKeys(true)
    expect(state().scannedMods).toEqual([])
  })
})

describe('the game installation folder', () => {
  it('comes back with the game snapshot', () => {
    state().loadGame('stellaris', {
      modFolder: 'workshop',
      outputFolder: '',
      sourceLanguage: 'en',
      targets: [],
      gamePath: 'C:/Games/Stellaris'
    })
    expect(state().translate.gamePath).toBe('C:/Games/Stellaris')
  })

  it('is replaced, not kept, by the snapshot of another game', () => {
    state().setTranslate({ gamePath: 'C:/Games/Stellaris' })
    state().loadGame('ck3', {
      modFolder: '',
      outputFolder: '',
      sourceLanguage: 'en',
      targets: [],
      gamePath: ''
    })
    expect(state().translate.gamePath).toBe('')
  })

  it('leaves the rest of the backend settings alone', () => {
    state().setTranslate({ model: 'my-finetune:v3' })
    state().loadGame('stellaris', {
      modFolder: '',
      outputFolder: '',
      sourceLanguage: 'en',
      targets: [],
      gamePath: 'C:/Games/Stellaris'
    })
    expect(state().translate.model).toBe('my-finetune:v3')
  })
})

describe('loadGame snapshot', () => {
  it('carries the targets over verbatim', () => {
    state().loadGame('stellaris', {
      modFolder: '',
      outputFolder: '',
      sourceLanguage: 'en',
      targets: [
        { language: 'ru', fileToken: 'russian' },
        { language: 'tr', fileToken: 'english' }
      ],
      gamePath: ''
    })
    expect(state().targets).toEqual([
      { language: 'ru', fileToken: 'russian' },
      { language: 'tr', fileToken: 'english' }
    ])
  })
})

describe('toggleTargetLanguage', () => {
  it('adds a target for a language with no target yet', () => {
    state().toggleTargetLanguage('ru', 'russian')
    expect(state().targets).toEqual([{ language: 'ru', fileToken: 'russian' }])
  })

  it('removes the existing target for that language, whatever its token', () => {
    state().addCustomTarget({ language: 'ru', fileToken: 'mylang' })
    state().toggleTargetLanguage('ru', 'russian')
    expect(state().targets).toEqual([])
  })
})

describe('addCustomTarget', () => {
  it('replaces a same-language target rather than duplicating it', () => {
    state().toggleTargetLanguage('ru', 'russian')
    state().addCustomTarget({ language: 'ru', fileToken: 'english' })
    expect(state().targets).toEqual([{ language: 'ru', fileToken: 'english' }])
  })

  it('adds alongside targets for other languages', () => {
    state().toggleTargetLanguage('ru', 'russian')
    state().addCustomTarget({ language: 'tr', fileToken: 'english' })
    expect(state().targets).toEqual([
      { language: 'ru', fileToken: 'russian' },
      { language: 'tr', fileToken: 'english' }
    ])
  })

  it('replaces a same-language target across spellings, rather than duplicating it', () => {
    state().addCustomTarget({ language: 'tr', fileToken: 'turkish' })
    state().addCustomTarget({ language: 'Turkish', fileToken: 'english' })
    expect(state().targets).toEqual([{ language: 'tr', fileToken: 'english' }])
  })

  it('stores the language normalized, whatever spelling was passed in', () => {
    state().addCustomTarget({ language: 'Catalan ', fileToken: 'english' })
    expect(state().targets).toEqual([{ language: 'Catalan', fileToken: 'english' }])
  })
})

describe('removeTarget', () => {
  it('removes only the target for the given language', () => {
    state().toggleTargetLanguage('ru', 'russian')
    state().addCustomTarget({ language: 'tr', fileToken: 'english' })
    state().removeTarget('ru')
    expect(state().targets).toEqual([{ language: 'tr', fileToken: 'english' }])
  })

  it('removes a free-text label target', () => {
    state().addCustomTarget({ language: 'Catalan', fileToken: 'english' })
    state().removeTarget('Catalan')
    expect(state().targets).toEqual([])
  })
})

describe('setSourceLanguage', () => {
  it('drops the target that would now equal the source', () => {
    state().toggleTargetLanguage('fr', 'french')
    state().setSourceLanguage('fr')
    expect(state().targets).toEqual([])
  })

  it('leaves other targets alone', () => {
    state().toggleTargetLanguage('ru', 'russian')
    state().setSourceLanguage('fr')
    expect(state().targets).toEqual([{ language: 'ru', fileToken: 'russian' }])
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
    state().toggleTargetLanguage('ru', 'russian')
    expect(canRun(state())).toBe(true)
  })

  it('needs an output folder in extract mode', () => {
    state().setModFolder('workshop')
    state().toggleTargetLanguage('ru', 'russian')
    state().setMode('extract-to-folder')
    expect(canRun(state())).toBe(false)
    state().setOutputFolder('out')
    expect(canRun(state())).toBe(true)
  })

  it('never depends on retranslateOwnKeys, a per-run option with no bearing on readiness', () => {
    state().setModFolder('workshop')
    state().toggleTargetLanguage('ru', 'russian')
    state().setRetranslateOwnKeys(true)
    expect(canRun(state())).toBe(true)
  })
})

describe('retranslateOwnKeys', () => {
  it('defaults to false', () => {
    expect(state().retranslateOwnKeys).toBe(false)
  })

  it('is set by its setter', () => {
    state().setRetranslateOwnKeys(true)
    expect(state().retranslateOwnKeys).toBe(true)
  })

  it('is put back to false by reset()', () => {
    state().setRetranslateOwnKeys(true)
    state().reset()
    expect(state().retranslateOwnKeys).toBe(false)
  })
})
