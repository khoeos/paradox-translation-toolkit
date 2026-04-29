import { app } from 'electron'
import { z } from 'zod'

import { log } from '../../log.js'
import { publicProcedure, router } from '../trpc.js'

export const appProceduresRouter = router({
  /** Forwards renderer-side errors to the persistent log. */
  logRendererError: publicProcedure
    .input(
      z.object({
        message: z.string(),
        stack: z.string().nullable(),
        componentStack: z.string().nullable()
      })
    )
    .mutation(({ input }) => {
      log.error('[renderer] uncaught error:', input.message)
      if (input.stack !== null) log.error(input.stack)
      if (input.componentStack !== null) log.error(`Component stack:${input.componentStack}`)
    }),

  /** Opens the persistent log folder via the dialog service. */
  openLogsFolder: publicProcedure.mutation(({ ctx }) => ctx.dialog.openPath(app.getPath('logs')))
})
