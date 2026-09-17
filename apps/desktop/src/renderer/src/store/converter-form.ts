import { create } from 'zustand'

import type { ScannedMod } from '@ptt/converter'
import type { ConvertMode, LanguageCode, TargetContent } from '@ptt/shared'
import type { TranslationTarget } from '@ptt/shared/languages'
import { normalizeTargetLanguage } from '@ptt/shared/languages'
import type { TranslateConfig } from '@ptt/translate'
import { TRANSLATE_DEFAULTS, isDefaultBaseUrl, PROVIDER_DEFAULTS } from '@ptt/translate/defaults'

interface GameFormSnapshot {
  modFolder: string
  outputFolder: string
  sourceLanguage: LanguageCode
  targets: TranslationTarget[]
  gamePath: string
}

export type PersistedTranslate = Omit<TranslateConfig, 'apiKey'>

interface ConverterFormState {
  selectedGameId: string | null
  modFolder: string
  outputFolder: string
  sourceLanguage: LanguageCode
  targets: TranslationTarget[]
  mode: ConvertMode
  targetContent: TargetContent
  modName: string

  scannedMods: ScannedMod[]
  selectedMods: Set<string>

  translate: PersistedTranslate
  apiKey: string

  setGame: (gameId: string) => void
  loadGame: (gameId: string, snapshot: GameFormSnapshot) => void
  setModFolder: (path: string) => void
  setOutputFolder: (path: string) => void
  setMode: (mode: ConvertMode) => void
  setSourceLanguage: (lang: LanguageCode) => void
  setTargetContent: (targetContent: TargetContent) => void
  toggleTargetLanguage: (language: LanguageCode, fileToken: string) => void
  addCustomTarget: (target: TranslationTarget) => void
  removeTarget: (language: string) => void
  setModName: (name: string) => void
  setScannedMods: (mods: ScannedMod[]) => void
  toggleMod: (id: string) => void
  setSelectedMods: (ids: string[]) => void
  setTranslate: (patch: Partial<PersistedTranslate>) => void
  setTranslateProvider: (provider: PersistedTranslate['provider']) => void
  setApiKey: (key: string) => void
  reset: () => void
}

function invalidateScan(): Pick<ConverterFormState, 'scannedMods' | 'selectedMods'> {
  return { scannedMods: [], selectedMods: new Set<string>() }
}

const withoutLanguage = (
  targets: readonly TranslationTarget[],
  language: string
): TranslationTarget[] => {
  const normalized = normalizeTargetLanguage(language)
  return targets.filter(target => normalizeTargetLanguage(target.language) !== normalized)
}

export const useConverterFormStore = create<ConverterFormState>(set => ({
  selectedGameId: null,
  modFolder: '',
  outputFolder: '',
  sourceLanguage: 'en',
  targets: [],
  mode: 'add-to-current',
  targetContent: 'missing-keys',
  modName: '',
  scannedMods: [],
  selectedMods: new Set<string>(),
  translate: { ...TRANSLATE_DEFAULTS },
  apiKey: '',

  setGame: gameId => set({ selectedGameId: gameId, ...invalidateScan() }),
  loadGame: (gameId, snapshot) =>
    set(state => ({
      selectedGameId: gameId,
      modFolder: snapshot.modFolder,
      outputFolder: snapshot.outputFolder,
      sourceLanguage: snapshot.sourceLanguage,
      targets: [...snapshot.targets],
      translate: { ...state.translate, gamePath: snapshot.gamePath },
      ...invalidateScan()
    })),
  setModFolder: modFolder => set({ modFolder, ...invalidateScan() }),
  setOutputFolder: outputFolder => set({ outputFolder }),
  setMode: mode => set({ mode }),
  setSourceLanguage: lang =>
    set(state => ({
      sourceLanguage: lang,
      targets: withoutLanguage(state.targets, lang),
      ...invalidateScan()
    })),
  setTargetContent: targetContent => set({ targetContent }),
  toggleTargetLanguage: (language, fileToken) =>
    set(state => {
      const withoutIt = withoutLanguage(state.targets, language)
      const targets =
        withoutIt.length === state.targets.length
          ? [...state.targets, { language, fileToken }]
          : withoutIt
      return { targets, ...invalidateScan() }
    }),
  addCustomTarget: target =>
    set(state => {
      const language = normalizeTargetLanguage(target.language)
      return {
        targets: [...withoutLanguage(state.targets, language), { ...target, language }],
        ...invalidateScan()
      }
    }),
  removeTarget: language =>
    set(state => ({ targets: withoutLanguage(state.targets, language), ...invalidateScan() })),
  setModName: modName => set({ modName }),
  setScannedMods: mods =>
    set({
      scannedMods: mods,
      selectedMods: new Set(mods.filter(mod => mod.missingFiles > 0).map(mod => mod.id))
    }),
  toggleMod: id =>
    set(state => {
      const next = new Set(state.selectedMods)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return { selectedMods: next }
    }),
  setSelectedMods: ids => set({ selectedMods: new Set(ids) }),
  setTranslate: patch => set(state => ({ translate: { ...state.translate, ...patch } })),
  setTranslateProvider: provider =>
    set(state => {
      const defaults = PROVIDER_DEFAULTS[provider]
      const baseUrl = isDefaultBaseUrl(state.translate.baseUrl)
        ? defaults.baseUrl
        : state.translate.baseUrl
      const model =
        state.translate.model === '' || isDefaultModel(state.translate.model)
          ? defaults.model
          : state.translate.model
      return { translate: { ...state.translate, provider, baseUrl, model } }
    }),
  setApiKey: apiKey => set({ apiKey }),
  reset: () =>
    set({
      modFolder: '',
      outputFolder: '',
      sourceLanguage: 'en',
      targets: [],
      mode: 'add-to-current',
      targetContent: 'missing-keys',
      modName: '',
      translate: { ...TRANSLATE_DEFAULTS },
      apiKey: '',
      ...invalidateScan()
    })
}))

function isDefaultModel(model: string): boolean {
  return Object.values(PROVIDER_DEFAULTS).some(defaults => defaults.model === model)
}

export function canRun(state: ConverterFormState): boolean {
  if (!state.selectedGameId) return false
  if (state.modFolder.length === 0) return false
  if (state.targets.length === 0) return false
  if (state.mode === 'extract-to-folder' && state.outputFolder.length === 0) return false
  return true
}

export function runTranslateConfig(state: ConverterFormState): TranslateConfig | undefined {
  if (!state.translate.enabled) return undefined
  return {
    ...state.translate,
    ...(state.apiKey.length > 0 && { apiKey: state.apiKey })
  }
}
