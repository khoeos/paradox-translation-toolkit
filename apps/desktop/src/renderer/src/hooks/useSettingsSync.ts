import { useEffect, useRef } from 'react'

import { trpc } from '@renderer/lib/trpc'
import { useConverterFormStore } from '@renderer/store/converter-form'

type SettingsPatch = Parameters<ReturnType<typeof trpc.settings.update.useMutation>['mutate']>[0]

const PERSIST_DEBOUNCE_MS = 400

/**
 * Two-way sync between the form store and persisted settings:
 * - hydrate the form from settings on boot and on game switch,
 * - persist form changes back to settings, debounced (400ms) and merged.
 */
export function useSettingsSync(): void {
  const utils = trpc.useUtils()
  const settingsQuery = trpc.settings.getAll.useQuery()
  const updateMutation = trpc.settings.update.useMutation({
    onSuccess: data => utils.settings.getAll.setData(undefined, data)
  })

  // Refs let the subscribe effect read the latest values without re-subscribing.
  const persistRef = useRef(updateMutation.mutate)
  persistRef.current = updateMutation.mutate
  const utilsRef = useRef(utils)
  utilsRef.current = utils

  const hydrated = useRef(false)
  const isHydrating = useRef(false)

  // Initial hydration: runs once when the first `getAll` resolves.
  useEffect(() => {
    if (!settingsQuery.data || hydrated.current) return
    hydrated.current = true

    const s = settingsQuery.data
    const store = useConverterFormStore.getState()

    if (s.lastGameId) {
      isHydrating.current = true
      store.loadGame(s.lastGameId, {
        modFolder: s.lastModFolder[s.lastGameId] ?? '',
        outputFolder: s.lastOutputFolder[s.lastGameId] ?? '',
        sourceLanguage: s.sourceLanguage[s.lastGameId] ?? s.defaultSourceLanguage,
        targetLanguages: s.targetLanguages[s.lastGameId] ?? []
      })
      isHydrating.current = false
    }
    store.setMode(s.mode)
    store.setOverwrite(s.overwrite)
  }, [settingsQuery.data])

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
          isHydrating.current = true
          useConverterFormStore.getState().loadGame(newGameId, {
            modFolder: fresh.lastModFolder[newGameId] ?? '',
            outputFolder: fresh.lastOutputFolder[newGameId] ?? '',
            sourceLanguage: fresh.sourceLanguage[newGameId] ?? fresh.defaultSourceLanguage,
            targetLanguages: fresh.targetLanguages[newGameId] ?? []
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
        if (state.targetLanguages !== prev.targetLanguages && state.selectedGameId) {
          const current = fresh?.targetLanguages ?? {}
          patch.targetLanguages = {
            ...current,
            [state.selectedGameId]: Array.from(state.targetLanguages)
          }
        }
      }

      if (state.mode !== prev.mode) {
        patch.mode = state.mode
      }
      if (state.overwrite !== prev.overwrite) {
        patch.overwrite = state.overwrite
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
