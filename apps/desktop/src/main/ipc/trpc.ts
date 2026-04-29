import { initTRPC } from '@trpc/server'

import type { AppContext } from './context.js'

const t = initTRPC.context<AppContext>().create({
  isServer: true
})

export const router = t.router
export const publicProcedure = t.procedure
export const middleware = t.middleware
