import type { ConverterService } from '../services/converter-service.js'
import { dialogService } from '../services/dialog-service.js'
import type { GameLocatorService } from '../services/game-locator-service.js'
import type { OpenableRegistry } from '../services/openable-registry.js'
import type { ReportService } from '../services/report-service.js'
import type { SettingsService } from '../services/settings-service.js'
import type { TranslateService } from '../services/translate-service.js'
import type { UpdaterService } from '../services/updater-service.js'

export interface AppContext {
  converter: ConverterService
  settings: SettingsService
  updater: UpdaterService
  translate: TranslateService
  report: ReportService
  openable: OpenableRegistry
  gameLocator: GameLocatorService
  dialog: typeof dialogService
}

export function createContext(deps: {
  converter: ConverterService
  settings: SettingsService
  updater: UpdaterService
  translate: TranslateService
  report: ReportService
  openable: OpenableRegistry
  gameLocator: GameLocatorService
}): AppContext {
  return {
    converter: deps.converter,
    settings: deps.settings,
    updater: deps.updater,
    translate: deps.translate,
    report: deps.report,
    openable: deps.openable,
    gameLocator: deps.gameLocator,
    dialog: dialogService
  }
}
