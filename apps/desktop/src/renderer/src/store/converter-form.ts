import { create } from 'zustand'

import type { ConvertMode, LanguageCode } from '@ptt/shared-types'

interface GameFormSnapshot {
  modFolder: string
  outputFolder: string
  sourceLanguage: LanguageCode
  targetLanguages: LanguageCode[]
}

interface ConverterFormState {
  selectedGameId: string | null
  modFolder: string
  outputFolder: string
  sourceLanguage: LanguageCode
  targetLanguages: Set<LanguageCode>
  mode: ConvertMode
  overwrite: boolean

  setGame: (gameId: string) => void
  loadGame: (gameId: string, snapshot: GameFormSnapshot) => void
  setModFolder: (path: string) => void
  setOutputFolder: (path: string) => void
  setMode: (mode: ConvertMode) => void
  setSourceLanguage: (lang: LanguageCode) => void
  setOverwrite: (overwrite: boolean) => void
  toggleTargetLanguage: (lang: LanguageCode) => void
  reset: () => void
}

export const useConverterFormStore = create<ConverterFormState>(set => ({
  selectedGameId: null,
  modFolder: '',
  outputFolder: '',
  sourceLanguage: 'en',
  targetLanguages: new Set<LanguageCode>(),
  mode: 'add-to-current',
  overwrite: false,

  setGame: gameId => set({ selectedGameId: gameId }),
  loadGame: (gameId, snapshot) =>
    set({
      selectedGameId: gameId,
      modFolder: snapshot.modFolder,
      outputFolder: snapshot.outputFolder,
      sourceLanguage: snapshot.sourceLanguage,
      targetLanguages: new Set(snapshot.targetLanguages)
    }),
  setModFolder: modFolder => set({ modFolder }),
  setOutputFolder: outputFolder => set({ outputFolder }),
  setMode: mode => set({ mode }),
  setSourceLanguage: lang =>
    set(state => {
      const next = new Set(state.targetLanguages)
      next.delete(lang)
      return { sourceLanguage: lang, targetLanguages: next }
    }),
  setOverwrite: overwrite => set({ overwrite }),
  toggleTargetLanguage: lang =>
    set(state => {
      const next = new Set(state.targetLanguages)
      if (next.has(lang)) next.delete(lang)
      else next.add(lang)
      return { targetLanguages: next }
    }),
  reset: () =>
    set({
      modFolder: '',
      outputFolder: '',
      sourceLanguage: 'en',
      targetLanguages: new Set<LanguageCode>(),
      mode: 'add-to-current',
      overwrite: false
    })
}))

export function canRun(state: ConverterFormState): boolean {
  if (!state.selectedGameId) return false
  if (state.modFolder.length === 0) return false
  if (state.targetLanguages.size === 0) return false
  if (state.mode === 'extract-to-folder' && state.outputFolder.length === 0) return false
  return true
}
