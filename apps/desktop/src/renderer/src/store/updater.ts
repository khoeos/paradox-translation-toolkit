import { create } from 'zustand'

import type { UpdaterEvent, UpdaterSnapshot } from '@ptt/shared/updater'


export { isUpdaterEvent } from '@ptt/shared/updater'
export type { UpdaterEvent, UpdaterStatus } from '@ptt/shared/updater'

interface UpdaterUiState extends UpdaterSnapshot {
  dismissed: boolean
  applyEvent: (e: UpdaterEvent) => void
  hydrateFromState: (state: UpdaterSnapshot) => void
  dismiss: () => void
}


export const isUpdateBannerVisible = (
  state: Pick<UpdaterUiState, 'status' | 'dismissed'>
): boolean =>
  !state.dismissed &&
  state.status !== 'idle' &&
  state.status !== 'checking' &&
  state.status !== 'not-available' &&
  state.status !== 'error'

export const useUpdaterStore = create<UpdaterUiState>(set => ({
  status: 'idle',
  latestVersion: null,
  downloadProgress: 0,
  errorMessage: null,
  releaseNotes: null,
  dismissed: false,
  autoUpdateSupported: false,
  releaseUrl: '',

  applyEvent: event =>
    set(s => {
      switch (event.type) {
        case 'checking':
          return { ...s, status: 'checking', errorMessage: null }
        case 'available':
          return {
            ...s,
            status: 'available',
            latestVersion: event.version,
            releaseNotes: event.releaseNotes,
            dismissed: false
          }
        case 'not-available':
          return { ...s, status: 'not-available', latestVersion: event.version }
        case 'download-progress':
          return { ...s, status: 'downloading', downloadProgress: event.percent }
        case 'ready':
          return { ...s, status: 'ready', latestVersion: event.version, dismissed: false }
        case 'error':
          return { ...s, status: 'error', errorMessage: event.message }
        case 'redirected-to-browser':
          return { ...s, dismissed: true }
      }
    }),

  hydrateFromState: state => set(s => ({ ...s, ...state })),

  dismiss: () => set({ dismissed: true })
}))

