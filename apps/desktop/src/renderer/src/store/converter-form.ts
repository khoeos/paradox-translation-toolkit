import { create } from 'zustand'

import type { ScannedMod } from '@ptt/converter'
import type { ConvertMode, LanguageCode } from '@ptt/shared'
import type { TranslateConfig } from '@ptt/translate'
import {
  TRANSLATE_DEFAULTS,
  isDefaultBaseUrl,
  PROVIDER_DEFAULTS
} from '@ptt/translate/defaults'

interface GameFormSnapshot {
  modFolder: string
  outputFolder: string
  sourceLanguage: LanguageCode
  targetLanguages: LanguageCode[]
}

/** The translation settings, minus the key, which is kept out of anything persisted. */
export type PersistedTranslate = Omit<TranslateConfig, 'apiKey'>

interface ConverterFormState {
  selectedGameId: string | null
  modFolder: string
  outputFolder: string
  sourceLanguage: LanguageCode
  targetLanguages: Set<LanguageCode>
  mode: ConvertMode
  overwrite: boolean
  /** Name of the generated translation mod, shown in the launcher. */
  modName: string

  /** Result of the last scan. Emptied whenever the scan would no longer describe the form. */
  scannedMods: ScannedMod[]
  selectedMods: Set<string>

  translate: PersistedTranslate
  /**
   * The API key, in memory only, never persisted and never in a report.
   * It lives here rather than in `translate` so no accidental serialisation can carry it.
   */
  apiKey: string

  setGame: (gameId: string) => void
  loadGame: (gameId: string, snapshot: GameFormSnapshot) => void
  setModFolder: (path: string) => void
  setOutputFolder: (path: string) => void
  setMode: (mode: ConvertMode) => void
  setSourceLanguage: (lang: LanguageCode) => void
  setOverwrite: (overwrite: boolean) => void
  toggleTargetLanguage: (lang: LanguageCode) => void
  setModName: (name: string) => void
  setScannedMods: (mods: ScannedMod[]) => void
  toggleMod: (id: string) => void
  setSelectedMods: (ids: string[]) => void
  setTranslate: (patch: Partial<PersistedTranslate>) => void
  setTranslateProvider: (provider: PersistedTranslate['provider']) => void
  setApiKey: (key: string) => void
  reset: () => void
}

/**
 * Everything a scan result depends on. Changing any of it makes the result a lie, so the list
 * is dropped rather than left on screen describing a folder the user has moved on from.
 */
function invalidateScan(): Pick<ConverterFormState, 'scannedMods' | 'selectedMods'> {
  return { scannedMods: [], selectedMods: new Set<string>() }
}

export const useConverterFormStore = create<ConverterFormState>(set => ({
  selectedGameId: null,
  modFolder: '',
  outputFolder: '',
  sourceLanguage: 'en',
  targetLanguages: new Set<LanguageCode>(),
  mode: 'add-to-current',
  overwrite: false,
  modName: '',
  scannedMods: [],
  selectedMods: new Set<string>(),
  translate: { ...TRANSLATE_DEFAULTS },
  apiKey: '',

  setGame: gameId => set({ selectedGameId: gameId, ...invalidateScan() }),
  loadGame: (gameId, snapshot) =>
    set({
      selectedGameId: gameId,
      modFolder: snapshot.modFolder,
      outputFolder: snapshot.outputFolder,
      sourceLanguage: snapshot.sourceLanguage,
      targetLanguages: new Set(snapshot.targetLanguages),
      ...invalidateScan()
    }),
  setModFolder: modFolder => set({ modFolder, ...invalidateScan() }),
  setOutputFolder: outputFolder => set({ outputFolder }),
  setMode: mode => set({ mode }),
  setSourceLanguage: lang =>
    set(state => {
      const next = new Set(state.targetLanguages)
      next.delete(lang)
      return { sourceLanguage: lang, targetLanguages: next, ...invalidateScan() }
    }),
  setOverwrite: overwrite => set({ overwrite }),
  toggleTargetLanguage: lang =>
    set(state => {
      const next = new Set(state.targetLanguages)
      if (next.has(lang)) next.delete(lang)
      else next.add(lang)
      return { targetLanguages: next, ...invalidateScan() }
    }),
  setModName: modName => set({ modName }),
  setScannedMods: mods =>
    set({
      scannedMods: mods,
      // Everything with work to do is ticked: that is what the user came for.
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
      // A URL the user typed is never overwritten; a default left untouched is.
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
      targetLanguages: new Set<LanguageCode>(),
      mode: 'add-to-current',
      overwrite: false,
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
  if (state.targetLanguages.size === 0) return false
  if (state.mode === 'extract-to-folder' && state.outputFolder.length === 0) return false
  return true
}

/** The generated translation mod is only reachable once a scan told us what is missing. */
export function canConvertSelection(state: ConverterFormState): boolean {
  if (!canRun(state)) return false
  if (state.mode !== 'create-translation-mod') return true
  return state.scannedMods.length > 0 && state.selectedMods.size > 0
}

/** The settings a run needs, with the in-memory key put back only for that call. */
export function runTranslateConfig(state: ConverterFormState): TranslateConfig | undefined {
  if (!state.translate.enabled) return undefined
  return {
    ...state.translate,
    ...(state.apiKey.length > 0 && { apiKey: state.apiKey })
  }
}
