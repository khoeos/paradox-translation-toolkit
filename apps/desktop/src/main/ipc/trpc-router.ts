import { appProceduresRouter } from './procedures/app.js'
import { converterRouter } from './procedures/converter.js'
import { fsRouter } from './procedures/fs.js'
import { gameLocatorRouter } from './procedures/game-locator.js'
import { gamesRouter } from './procedures/games.js'
import { reportRouter } from './procedures/report.js'
import { runReportsRouter } from './procedures/run-reports.js'
import { settingsRouter } from './procedures/settings.js'
import { translateRouter } from './procedures/translate.js'
import { updaterRouter } from './procedures/updater.js'
import { router } from './trpc.js'

export const appRouter = router({
  app: appProceduresRouter,
  games: gamesRouter,
  converter: converterRouter,
  settings: settingsRouter,
  translate: translateRouter,
  fs: fsRouter,
  updater: updaterRouter,
  report: reportRouter,
  gameLocator: gameLocatorRouter,
  runReports: runReportsRouter
})

export type AppRouter = typeof appRouter
