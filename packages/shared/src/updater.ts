export const UPDATER_STATUSES = [
  'idle',
  'checking',
  'available',
  'not-available',
  'downloading',
  'ready',
  'error',
  'disabled'
] as const

export type UpdaterStatus = (typeof UPDATER_STATUSES)[number]

export const UPDATER_EVENT_TYPES = [
  'checking',
  'available',
  'not-available',
  'download-progress',
  'ready',
  'error',
  'redirected-to-browser'
] as const

export type UpdaterEventType = (typeof UPDATER_EVENT_TYPES)[number]

export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string; releaseNotes: string | null }
  | { type: 'not-available'; version: string }
  | { type: 'download-progress'; percent: number }
  | { type: 'ready'; version: string }
  | { type: 'error'; message: string }
  | { type: 'redirected-to-browser'; version: string | null }

export interface UpdaterSnapshot {
  status: UpdaterStatus
  latestVersion: string | null
  downloadProgress: number
  errorMessage: string | null
  releaseNotes: string | null
  autoUpdateSupported: boolean
  releaseUrl: string
}

const KNOWN_TYPES = new Set<string>(UPDATER_EVENT_TYPES)

export function isUpdaterEvent(value: unknown): value is UpdaterEvent {
  if (typeof value !== 'object' || value === null) return false
  if (!('type' in value)) return false
  return typeof value.type === 'string' && KNOWN_TYPES.has(value.type)
}
