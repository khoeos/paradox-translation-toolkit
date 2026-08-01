import { GameId } from '@global/constants'
import { ConvertMode, ScannedMod, TranslateConfig, TranslateProvider } from '@global/types'
import { create } from 'zustand'

/** Sensible starting point per backend, both are editable */
export const PROVIDER_DEFAULTS: Record<TranslateProvider, { baseUrl: string; model: string }> = {
  [TranslateProvider.OLLAMA]: { baseUrl: 'http://localhost:11434', model: 'qwen3.6:latest' },
  [TranslateProvider.OPENAI]: { baseUrl: 'https://api.groq.com/openai/v1', model: '' }
}

const DEFAULT_TRANSLATE: TranslateConfig = {
  enabled: false,
  provider: TranslateProvider.OLLAMA,
  ...PROVIDER_DEFAULTS[TranslateProvider.OLLAMA],
  apiKey: '',
  gamePath: '',
  batchSize: 20,
  concurrency: 1,
  retries: 2,
  timeout: 300000
}

interface OptionState {
  game: GameId
  setGame: (game: GameId) => void

  path: string
  setPath: (path: string) => void

  outputPath: string
  setOutputPath: (outputPath: string) => void

  modName: string
  setModName: (modName: string) => void

  sourceLanguage: string
  setSourceLanguage: (sourceLanguage: string) => void

  targetLanguage: string[]
  setTargetLanguage: (targetLanguage: string[]) => void
  toggleTargetLanguage: (targetLanguage: string) => void
  setLanguage(targetLanguage: string, value: boolean): void

  mode: ConvertMode
  setMode: (mode: ConvertMode) => void

  checkFiles: boolean
  setCheckFiles: (checkFiles: boolean) => void

  deepCheck: boolean
  setDeepCheck: (deepCheck: boolean) => void

  translate: TranslateConfig
  setTranslate: (translate: Partial<TranslateConfig>) => void
  setTranslateProvider: (provider: TranslateProvider) => void

  scannedMods: ScannedMod[]
  setScannedMods: (scannedMods: ScannedMod[]) => void

  selectedMods: string[]
  setSelectedMods: (selectedMods: string[]) => void
  toggleSelectedMod: (id: string) => void
}

const useOptionsStore = create<OptionState>()((set) => ({
  game: 'stl',
  setGame: (game: GameId): void => set({ game, scannedMods: [], selectedMods: [] }),

  path: '',
  setPath: (path: string): void => set({ path, scannedMods: [], selectedMods: [] }),

  outputPath: '',
  setOutputPath: (outputPath: string): void => set({ outputPath }),

  modName: 'Missing Translations',
  setModName: (modName: string): void => set({ modName }),

  sourceLanguage: 'en',
  setSourceLanguage: (sourceLanguage: string): void => set({ sourceLanguage }),

  targetLanguage: [],
  setTargetLanguage: (targetLanguage: string[]): void => set({ targetLanguage }),
  toggleTargetLanguage: (targetLanguage: string): void =>
    set((state) => ({
      targetLanguage: state.targetLanguage.includes(targetLanguage)
        ? state.targetLanguage.filter((lang) => lang !== targetLanguage)
        : [...state.targetLanguage, targetLanguage]
    })),
  setLanguage: (targetLanguage: string, value: boolean): void => {
    set((state) => ({
      targetLanguage: value
        ? [...state.targetLanguage, targetLanguage]
        : state.targetLanguage.filter((lang) => lang !== targetLanguage),
      // The scan counted files per language, it no longer matches
      scannedMods: [],
      selectedMods: []
    }))
  },

  mode: ConvertMode.ADD_TO_CURRENT,
  setMode: (mode: ConvertMode): void => set({ mode }),

  checkFiles: false,
  setCheckFiles: (checkFiles: boolean): void => set({ checkFiles }),

  deepCheck: false,
  setDeepCheck: (deepCheck: boolean): void => set({ deepCheck }),

  translate: DEFAULT_TRANSLATE,
  setTranslate: (translate: Partial<TranslateConfig>): void =>
    set((state) => ({ translate: { ...state.translate, ...translate } })),
  setTranslateProvider: (provider: TranslateProvider): void =>
    set((state) => ({
      // Keep an address the user typed, replace the one we suggested
      translate: {
        ...state.translate,
        provider,
        ...(Object.values(PROVIDER_DEFAULTS).some((d) => d.baseUrl === state.translate.baseUrl)
          ? PROVIDER_DEFAULTS[provider]
          : {})
      }
    })),

  scannedMods: [],
  setScannedMods: (scannedMods: ScannedMod[]): void => set({ scannedMods }),

  selectedMods: [],
  setSelectedMods: (selectedMods: string[]): void => set({ selectedMods }),
  toggleSelectedMod: (id: string): void =>
    set((state) => ({
      selectedMods: state.selectedMods.includes(id)
        ? state.selectedMods.filter((mod) => mod !== id)
        : [...state.selectedMods, id]
    }))
}))

export default useOptionsStore
