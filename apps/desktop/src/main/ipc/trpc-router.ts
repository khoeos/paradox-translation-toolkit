import { appProceduresRouter } from './procedures/app.js'
import { converterRouter } from './procedures/converter.js'
import { fsRouter } from './procedures/fs.js'
import { gamesRouter } from './procedures/games.js'
import { settingsRouter } from './procedures/settings.js'
import { updaterRouter } from './procedures/updater.js'
import { router } from './trpc.js'

export const appRouter = router({
  app: appProceduresRouter,
  games: gamesRouter,
  converter: converterRouter,
  settings: settingsRouter,
  fs: fsRouter,
  updater: updaterRouter
})

export type AppRouter = typeof appRouter
