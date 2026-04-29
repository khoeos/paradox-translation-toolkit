import { create } from 'zustand'

export type UpdaterStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'ready'
  | 'error'
  | 'disabled'

export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string; releaseNotes: string | null }
  | { type: 'not-available'; version: string }
  | { type: 'download-progress'; percent: number }
  | { type: 'ready'; version: string }
  | { type: 'error'; message: string }
  | { type: 'redirected-to-browser'; version: string | null }

interface UpdaterUiState {
  status: UpdaterStatus
  latestVersion: string | null
  downloadProgress: number
  errorMessage: string | null
  releaseNotes: string | null
  dismissed: boolean
  autoUpdateSupported: boolean
  releaseUrl: string
  applyEvent: (e: UpdaterEvent) => void
  hydrateFromState: (state: {
    status: UpdaterStatus
    latestVersion: string | null
    downloadProgress: number
    errorMessage: string | null
    releaseNotes: string | null
    autoUpdateSupported: boolean
    releaseUrl: string
  }) => void
  dismiss: () => void
}

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

export function isUpdaterEvent(value: unknown): value is UpdaterEvent {
  if (typeof value !== 'object' || value === null) return false
  const v = value as { type?: unknown }
  return typeof v.type === 'string'
}
