import { contextBridge, ipcRenderer } from 'electron'

import { IPC_CHANNELS } from '@ptt/shared-types/ipc-channels'

function exposeElectronTRPC(): void {
  contextBridge.exposeInMainWorld('electronTRPC', {
    sendMessage: (operation: unknown) => ipcRenderer.send(IPC_CHANNELS.trpc, operation),
    onMessage: (callback: (response: unknown) => void) => {
      ipcRenderer.on(IPC_CHANNELS.trpc, (_event, data) => callback(data))
    }
  })
}

const api = {
  onJobEvent(handler: (event: unknown) => void): () => void {
    const listener = (_e: unknown, payload: unknown): void => handler(payload)
    ipcRenderer.on(IPC_CHANNELS.jobEvent, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.jobEvent, listener)
    }
  },
  onUpdaterEvent(handler: (event: unknown) => void): () => void {
    const listener = (_e: unknown, payload: unknown): void => handler(payload)
    ipcRenderer.on(IPC_CHANNELS.updaterEvent, listener)
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.updaterEvent, listener)
    }
  }
}

process.once('loaded', () => {
  exposeElectronTRPC()
  contextBridge.exposeInMainWorld('api', api)
})
