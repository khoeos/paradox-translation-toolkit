import { z } from 'zod'

import { getAllGameIds } from '@ptt/games'

import { publicProcedure, router } from '../trpc.js'

const GameIdSchema = z.enum(getAllGameIds())

export const gameLocatorRouter = router({
  locate: publicProcedure
    .input(z.object({ gameId: GameIdSchema }))
    .query(({ ctx, input }) => ctx.gameLocator.locateGame(input.gameId))
})
