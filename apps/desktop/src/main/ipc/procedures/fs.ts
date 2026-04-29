import { z } from 'zod'

import { publicProcedure, router } from '../trpc.js'

export const fsRouter = router({
  pickFolder: publicProcedure
    .input(z.object({ defaultPath: z.string().optional() }).optional())
    .mutation(({ ctx, input }) => ctx.dialog.pickFolder(input)),

  // Authorisation is enforced by `dialogService.openPath` (multi-layer policy:
  // critical-folder blocklist, OpenableRegistry, well-known Paradox paths,
  // userAllowedFolders, interactive bypass). The procedure is intentionally
  // thin so the policy stays in one place.
  openPath: publicProcedure
    .input(z.object({ path: z.string() }))
    .mutation(({ ctx, input }) => ctx.dialog.openPath(input.path))
})
