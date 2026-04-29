import { getGameSummaries } from '@ptt/game-registry'

import { publicProcedure, router } from '../trpc.js'

export const gamesRouter = router({
  list: publicProcedure.query(() => getGameSummaries())
})
