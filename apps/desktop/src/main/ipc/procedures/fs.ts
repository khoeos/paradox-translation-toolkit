import { z } from 'zod'

import { isExistingDirectory, readClipboardText } from '../../services/dialog-service.js'
import { isCriticalFolder } from '../../services/path-policy.js'
import { publicProcedure, router } from '../trpc.js'

export type PathValidationStatus = 'ok' | 'not-found' | 'critical'

export const validatePath = async (path: string): Promise<PathValidationStatus> => {
  if (!(await isExistingDirectory(path))) return 'not-found'
  if (isCriticalFolder(path)) return 'critical'
  return 'ok'
}

export const fsRouter = router({
  pickFolder: publicProcedure
    .input(z.object({ defaultPath: z.string().optional() }).optional())
    .mutation(({ ctx, input }) => ctx.dialog.pickFolder(input)),

  openPath: publicProcedure
    .input(z.object({ path: z.string() }))
    .mutation(({ ctx, input }) => ctx.dialog.openPath(input.path)),

  showItemInFolder: publicProcedure
    .input(z.object({ path: z.string() }))
    .mutation(({ ctx, input }) => ctx.dialog.showItemInFolder(input.path)),

  validatePath: publicProcedure
    .input(z.object({ path: z.string() }))
    .query(({ input }) => validatePath(input.path)),

  readClipboardText: publicProcedure.query(() => readClipboardText())
})
