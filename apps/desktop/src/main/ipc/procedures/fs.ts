import { z } from 'zod'

import { publicProcedure, router } from '../trpc.js'

export const fsRouter = router({
  pickFolder: publicProcedure
    .input(z.object({ defaultPath: z.string().optional() }).optional())
    .mutation(({ ctx, input }) => ctx.dialog.pickFolder(input)),

  openPath: publicProcedure
    .input(z.object({ path: z.string() }))
    .mutation(({ ctx, input }) => ctx.dialog.openPath(input.path)),

  showItemInFolder: publicProcedure
    .input(z.object({ path: z.string() }))
    .mutation(({ ctx, input }) => ctx.dialog.showItemInFolder(input.path))
})
