import { createTRPCClient } from '@trpc/client'
import { createTRPCReact } from '@trpc/react-query'

import type { AppRouter } from '@main/ipc/trpc-router'

import { ipcLink } from './ipc-link'

export const trpc = createTRPCReact<AppRouter>()

export const trpcClient = createTRPCClient<AppRouter>({
  links: [ipcLink()]
})
