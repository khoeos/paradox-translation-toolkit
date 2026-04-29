import { TRPCClientError, type TRPCLink } from '@trpc/client'
import type { AnyRouter, TRPCErrorShape } from '@trpc/server'
import { observable } from '@trpc/server/observable'

interface IpcSuccessResponse {
  id: number
  result: { type: 'data'; data: unknown }
}

interface IpcErrorResponse {
  id: number
  error: TRPCErrorShape
}

type IpcResponse = IpcSuccessResponse | IpcErrorResponse

const DEFAULT_IPC_TIMEOUT_MS = 120_000

/** tRPC paths whose work runs longer than DEFAULT_IPC_TIMEOUT_MS. */
const LONG_RUNNING_PATHS = new Set(['converter.scan', 'converter.run'])

interface PendingRequest {
  resolve: (data: unknown) => void
  reject: (err: unknown) => void
  timer: ReturnType<typeof setTimeout> | null
}

let nextRequestId = 0
const pending = new Map<number, PendingRequest>()
let listenerInstalled = false

function installListenerOnce(): void {
  if (listenerInstalled) return
  listenerInstalled = true
  window.electronTRPC.onMessage(raw => {
    const response = raw as IpcResponse
    const handler = pending.get(response.id)
    if (!handler) return
    pending.delete(response.id)
    if (handler.timer) clearTimeout(handler.timer)
    if ('error' in response) {
      handler.reject(response.error)
    } else {
      handler.resolve(response.result.data)
    }
  })
}

/**
 * tRPC link talking to the main process via `window.electronTRPC`.
 * Each request gets a watchdog timer; LONG_RUNNING_PATHS are exempt and
 * signal completion through job events instead.
 */
export function ipcLink<TRouter extends AnyRouter>(): TRPCLink<TRouter> {
  return () =>
    ({ op }) =>
      observable(observer => {
        installListenerOnce()
        const id = ++nextRequestId
        const isLongRunning = LONG_RUNNING_PATHS.has(op.path)

        const entry: PendingRequest = {
          resolve: data => {
            observer.next({ result: { type: 'data', data } })
            observer.complete()
          },
          reject: errorShape => {
            observer.error(
              TRPCClientError.from({
                error: errorShape
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
              } as any)
            )
          },
          timer: null
        }

        if (!isLongRunning) {
          entry.timer = setTimeout(() => {
            if (!pending.has(id)) return
            pending.delete(id)
            observer.error(
              new TRPCClientError(
                `IPC request timed out after ${DEFAULT_IPC_TIMEOUT_MS}ms (path: ${op.path})`
              )
            )
          }, DEFAULT_IPC_TIMEOUT_MS)
        }

        pending.set(id, entry)

        window.electronTRPC.sendMessage({
          id,
          method: op.type,
          params: { path: op.path, input: op.input }
        })

        return () => {
          const handler = pending.get(id)
          if (handler?.timer) clearTimeout(handler.timer)
          pending.delete(id)
        }
      })
}
