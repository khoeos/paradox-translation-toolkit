import { createTRPCClient } from '@trpc/client'
import { createTRPCContext } from '@trpc/tanstack-react-query'

import type { AppRouter } from '@main/ipc/trpc-router'

import { ipcLink } from './ipc-link'

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>()

export const trpcClient = createTRPCClient<AppRouter>({
  links: [ipcLink()]
})
