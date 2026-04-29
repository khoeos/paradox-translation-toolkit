import {
  callTRPCProcedure,
  getTRPCErrorShape,
  TRPCError,
  type AnyRouter,
  type inferRouterContext
} from '@trpc/server'
import { BrowserWindow, ipcMain, type IpcMainEvent } from 'electron'
import { z } from 'zod'

import { IPC_CHANNELS } from '@ptt/shared-types'

import { log } from '../log.js'

const RequestSchema = z.object({
  id: z.number(),
  method: z.enum(['query', 'mutation', 'subscription']),
  params: z.object({
    path: z.string(),
    input: z.unknown()
  })
})

type IpcRequest = z.infer<typeof RequestSchema>

interface IpcSuccessResponse {
  id: number
  result: { type: 'data'; data: unknown }
}

interface IpcErrorResponse {
  id: number
  error: unknown
}

export interface BridgeOptions<TRouter extends AnyRouter> {
  router: TRouter
  ctx: inferRouterContext<TRouter>
}

/** Listens on a single IPC channel and dispatches each message to the tRPC router. */
export function setupTrpcIpcBridge<TRouter extends AnyRouter>(opts: BridgeOptions<TRouter>): void {
  ipcMain.on(IPC_CHANNELS.trpc, (event, raw: unknown) => {
    const parsed = RequestSchema.safeParse(raw)
    if (!parsed.success) {
      log.warn('[bridge] rejected malformed IPC envelope:', parsed.error.message)
      // Try to recover the id so the renderer-side promise rejects cleanly
      // instead of hanging forever waiting for a response.
      const id = extractRequestId(raw)
      if (id !== null) {
        const response: IpcErrorResponse = {
          id,
          error: {
            message: 'Invalid IPC request envelope',
            code: -32600,
            data: { code: 'BAD_REQUEST', httpStatus: 400 }
          }
        }
        event.sender.send(IPC_CHANNELS.trpc, response)
      }
      return
    }
    void handleMessage(opts, event, parsed.data).catch(err => {
      log.error('[bridge] unexpected handler failure', err)
    })
  })
}

function extractRequestId(raw: unknown): number | null {
  if (typeof raw !== 'object' || raw === null || !('id' in raw)) return null
  const id = (raw as { id: unknown }).id
  return typeof id === 'number' ? id : null
}

async function handleMessage<TRouter extends AnyRouter>(
  opts: BridgeOptions<TRouter>,
  event: IpcMainEvent,
  message: IpcRequest
): Promise<void> {
  const { id, method, params } = message
  const { path, input } = params
  const { ctx } = opts

  try {
    const data = await callTRPCProcedure({
      router: opts.router,
      ctx,
      path,
      getRawInput: async () => input,
      type: method,
      signal: undefined,
      batchIndex: 0
    })
    const response: IpcSuccessResponse = {
      id,
      result: { type: 'data', data }
    }
    event.sender.send(IPC_CHANNELS.trpc, response)
  } catch (cause) {
    const error =
      cause instanceof TRPCError ? cause : new TRPCError({ code: 'INTERNAL_SERVER_ERROR', cause })

    const shape = getTRPCErrorShape({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      config: (opts.router as any)._def._config,
      error,
      type: method,
      path,
      input,
      ctx
    })

    const response: IpcErrorResponse = { id, error: shape }
    event.sender.send(IPC_CHANNELS.trpc, response)
  }
}

export function broadcastToWindows(channel: string, payload: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send(channel, payload)
  }
}
