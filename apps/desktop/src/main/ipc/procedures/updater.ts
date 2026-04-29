import { publicProcedure, router } from '../trpc.js'

export const updaterRouter = router({
  getState: publicProcedure.query(({ ctx }) => ctx.updater.getState()),
  check: publicProcedure.mutation(({ ctx }) => ctx.updater.check()),
  download: publicProcedure.mutation(({ ctx }) => ctx.updater.download()),
  installNow: publicProcedure.mutation(({ ctx }) => ctx.updater.installNow())
})
