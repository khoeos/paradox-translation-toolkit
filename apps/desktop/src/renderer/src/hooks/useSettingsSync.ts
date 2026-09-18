import { useEffect, useRef } from 'react'

import type { LanguageCode } from '@ptt/shared'
import type { GameTokens, TranslationTarget } from '@ptt/shared/languages'
import {
  isLanguageCode,
  normalizeTargets,
  targetsFromLanguages,
  uniqueTargetLanguages
} from '@ptt/shared/languages'

import { trpc } from '@renderer/lib/trpc'
import type { BackendsByProvider, PersistedTranslate } from '@renderer/store/converter-form'
import { backendsWith, useConverterFormStore } from '@renderer/store/converter-form'

type SettingsPatch = Parameters<ReturnType<typeof trpc.settings.update.useMutation>['mutate']>[0]

const PERSIST_DEBOUNCE_MS = 400

export function resolveStoredTargets(
  gameId: string,
  targets: Partial<Record<string, TranslationTarget[]>>,
  targetLanguages: Partial<Record<string, LanguageCode[]>>,
  tokens: GameTokens
): TranslationTarget[] {
  const stored = targets[gameId]
  if (stored && stored.length > 0) return normalizeTargets(stored)
  const languages = targetLanguages[gameId] ?? []
  return normalizeTargets(targetsFromLanguages(languages, tokens))
}

export function deriveLegacyTargetLanguages(targets: readonly TranslationTarget[]): LanguageCode[] {
  return uniqueTargetLanguages(targets).filter(isLanguageCode)
}

type StoredTranslate = {
  enabled: boolean
  provider: PersistedTranslate['provider']
  backends: BackendsByProvider
  batchSize: number
  concurrency: number
  retries: number
  timeout: number
}

export function toStoredTranslate(
  translate: PersistedTranslate,
  backends: BackendsByProvider
): StoredTranslate {
  return {
    enabled: translate.enabled,
    provider: translate.provider,
    backends: backendsWith(backends, translate.provider, {
      baseUrl: translate.baseUrl,
      model: translate.model
    }),
    batchSize: translate.batchSize,
    concurrency: translate.concurrency,
    retries: translate.retries,
    timeout: translate.timeout
  }
}

export function fromStoredTranslate(stored: StoredTranslate): {
  translate: Partial<PersistedTranslate>
  backends: BackendsByProvider
} {
  return {
    translate: {
      enabled: stored.enabled,
      provider: stored.provider,
      batchSize: stored.batchSize,
      concurrency: stored.concurrency,
      retries: stored.retries,
      timeout: stored.timeout
    },
    backends: stored.backends
  }
}

const TRANSLATE_KEYS = [
  'enabled',
  'provider',
  'baseUrl',
  'model',
  'batchSize',
  'concurrency',
  'retries',
  'timeout'
] as const

export const translateChanged = (a: PersistedTranslate, b: PersistedTranslate): boolean =>
  TRANSLATE_KEYS.some(key => a[key] !== b[key])

/**
 * Two-way sync between the form store and persisted settings:
 * - hydrate the form from settings on boot and on game switch,
 * - persist form changes back to settings, debounced (400ms) and merged.
 */
export function useSettingsSync(): void {
  const utils = trpc.useUtils()
  const settingsQuery = trpc.settings.getAll.useQuery()
  const gamesQuery = trpc.games.list.useQuery()
  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: data => utils.settings.getAll.setData(undefined, data)
  })

  // Refs let the subscribe effect read the latest values without re-subscribing.
  const persistRef = useRef(updateMutation.mutate)
  persistRef.current = updateMutation.mutate
  const utilsRef = useRef(utils)
  utilsRef.current = utils
  const gamesRef = useRef(gamesQuery.data)
  gamesRef.current = gamesQuery.data

  const hydrated = useRef(false)
  const isHydrating = useRef(false)

  useEffect(() => {
    if (!settingsQuery.data || !gamesQuery.data || hydrated.current) return
    hydrated.current = true

    const s = settingsQuery.data
    const store = useConverterFormStore.getState()

    if (s.lastGameId) {
      const tokens = gamesQuery.data.find(g => g.id === s.lastGameId)?.languageFileToken ?? {}
      isHydrating.current = true
      store.loadGame(s.lastGameId, {
        modFolder: s.lastModFolder[s.lastGameId] ?? '',
        outputFolder: s.lastOutputFolder[s.lastGameId] ?? '',
        sourceLanguage: s.sourceLanguage[s.lastGameId] ?? s.defaultSourceLanguage,
        targets: resolveStoredTargets(s.lastGameId, s.targets, s.targetLanguages, tokens),
        gamePath: s.gamePath[s.lastGameId] ?? ''
      })
      isHydrating.current = false
    }
    store.setMode(s.mode)
    store.setTargetContent(s.targetContent)

    const restored = fromStoredTranslate(s.translate)
    isHydrating.current = true
    store.loadBackends(restored.translate, restored.backends)
    isHydrating.current = false
  }, [settingsQuery.data, gamesQuery.data])

  // Subscribe once.
  useEffect(() => {
    let pendingPatch: SettingsPatch = {}
    let pendingTimer: ReturnType<typeof setTimeout> | null = null

    const flushPatch = (): void => {
      pendingTimer = null
      if (Object.keys(pendingPatch).length === 0) return
      const toSend = pendingPatch
      pendingPatch = {}
      persistRef.current(toSend)
    }

    const queuePatch = (incoming: SettingsPatch): void => {
      pendingPatch = { ...pendingPatch, ...incoming }
      if (pendingTimer) clearTimeout(pendingTimer)
      pendingTimer = setTimeout(flushPatch, PERSIST_DEBOUNCE_MS)
    }

    const unsubscribe = useConverterFormStore.subscribe((state, prev) => {
      if (!hydrated.current) return
      if (isHydrating.current) return

      const fresh = utilsRef.current.settings.getAll.getData()
      const patch: SettingsPatch = {}
      const newGameId =
        state.selectedGameId !== prev.selectedGameId && state.selectedGameId
          ? state.selectedGameId
          : null

      if (newGameId) {
        patch.lastGameId = newGameId
        if (fresh) {
          const tokens = gamesRef.current?.find(g => g.id === newGameId)?.languageFileToken ?? {}
          isHydrating.current = true
          useConverterFormStore.getState().loadGame(newGameId, {
            modFolder: fresh.lastModFolder[newGameId] ?? '',
            outputFolder: fresh.lastOutputFolder[newGameId] ?? '',
            sourceLanguage: fresh.sourceLanguage[newGameId] ?? fresh.defaultSourceLanguage,
            targets: resolveStoredTargets(newGameId, fresh.targets, fresh.targetLanguages, tokens),
            gamePath: fresh.gamePath[newGameId] ?? ''
          })
          isHydrating.current = false
        }
      } else {
        if (state.modFolder !== prev.modFolder && state.selectedGameId) {
          const current = fresh?.lastModFolder ?? {}
          patch.lastModFolder = { ...current, [state.selectedGameId]: state.modFolder }
        }
        if (state.outputFolder !== prev.outputFolder && state.selectedGameId) {
          const current = fresh?.lastOutputFolder ?? {}
          patch.lastOutputFolder = { ...current, [state.selectedGameId]: state.outputFolder }
        }
        if (state.sourceLanguage !== prev.sourceLanguage && state.selectedGameId) {
          const current = fresh?.sourceLanguage ?? {}
          patch.sourceLanguage = { ...current, [state.selectedGameId]: state.sourceLanguage }
        }
        if (state.targets !== prev.targets && state.selectedGameId) {
          const currentTargets = fresh?.targets ?? {}
          patch.targets = { ...currentTargets, [state.selectedGameId]: state.targets }
          const currentLanguages = fresh?.targetLanguages ?? {}
          const derivedLanguages = deriveLegacyTargetLanguages(state.targets)
          patch.targetLanguages = { ...currentLanguages, [state.selectedGameId]: derivedLanguages }
        }
        if (state.translate.gamePath !== prev.translate.gamePath && state.selectedGameId) {
          const current = fresh?.gamePath ?? {}
          patch.gamePath = { ...current, [state.selectedGameId]: state.translate.gamePath ?? '' }
        }
      }

      if (state.mode !== prev.mode) {
        patch.mode = state.mode
      }
      if (state.targetContent !== prev.targetContent) {
        patch.targetContent = state.targetContent
      }
      if (translateChanged(state.translate, prev.translate)) {
        patch.translate = toStoredTranslate(state.translate, state.backends)
      }

      if (Object.keys(patch).length > 0) {
        queuePatch(patch)
      }
    })

    return () => {
      // Flush any pending patch before tear-down.
      if (pendingTimer) {
        clearTimeout(pendingTimer)
        flushPatch()
      }
      unsubscribe()
    }
  }, [])
}
