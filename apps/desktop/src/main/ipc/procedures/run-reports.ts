import { z } from 'zod'

import { RUN_REPORT_FILE_PATTERN } from '@ptt/report'

import { publicProcedure, router } from '../trpc.js'

const FileInputSchema = z.object({ file: z.string().max(200).regex(RUN_REPORT_FILE_PATTERN) })

export const runReportsRouter = router({
  list: publicProcedure.query(({ ctx }) => ctx.runReports.list()),
  get: publicProcedure
    .input(FileInputSchema)
    .query(({ ctx, input }) => ctx.runReports.get(input.file)),
  remove: publicProcedure
    .input(FileInputSchema)
    .mutation(({ ctx, input }) => ctx.runReports.remove(input.file))
})
