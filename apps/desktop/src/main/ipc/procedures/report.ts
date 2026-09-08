import { z } from 'zod'

import { publicProcedure, router } from '../trpc.js'

const ReportInputSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  contact: z.string().trim().max(200).optional(),
  page: z.string().max(200),
  settings: z.string().max(4000),
  technical: z
    .object({
      paths: z.string().max(4000),
      jobs: z.array(z.string()).max(20)
    })
    .optional()
})

export const reportRouter = router({
  isEnabled: publicProcedure.query(({ ctx }) => ctx.report.isEnabled()),
  send: publicProcedure
    .input(ReportInputSchema)
    .mutation(({ ctx, input }) => ctx.report.sendReport(input))
})
