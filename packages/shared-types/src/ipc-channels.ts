/** IPC channel names. Kept zod-free so the sandboxed preload can import them. */
export const IPC_CHANNELS = {
  trpc: 'electron-trpc',
  jobEvent: 'ptt:job-event',
  updaterEvent: 'ptt:updater-event'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
