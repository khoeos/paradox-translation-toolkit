declare global {
  interface Window {
    electronTRPC: {
      sendMessage: (operation: unknown) => void
      onMessage: (callback: (response: unknown) => void) => void
    }
    api: {
      onJobEvent: (handler: (event: unknown) => void) => () => void
      onUpdaterEvent: (handler: (event: unknown) => void) => () => void
    }
  }
}

export {}
