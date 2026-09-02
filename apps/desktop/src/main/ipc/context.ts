import type { ConverterService } from '../services/converter-service.js'
import { dialogService } from '../services/dialog-service.js'
import type { OpenableRegistry } from '../services/openable-registry.js'
import type { SettingsService } from '../services/settings-service.js'
import type { TranslateService } from '../services/translate-service.js'
import type { UpdaterService } from '../services/updater-service.js'

export interface AppContext {
  converter: ConverterService
  settings: SettingsService
  updater: UpdaterService
  translate: TranslateService
  openable: OpenableRegistry
  dialog: typeof dialogService
}

export function createContext(deps: {
  converter: ConverterService
  settings: SettingsService
  updater: UpdaterService
  translate: TranslateService
  openable: OpenableRegistry
}): AppContext {
  return {
    converter: deps.converter,
    settings: deps.settings,
    updater: deps.updater,
    translate: deps.translate,
    openable: deps.openable,
    dialog: dialogService
  }
}
