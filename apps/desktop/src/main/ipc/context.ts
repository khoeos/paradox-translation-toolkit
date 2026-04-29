import type { ConverterService } from '../services/converter-service.js'
import { dialogService } from '../services/dialog-service.js'
import type { OpenableRegistry } from '../services/openable-registry.js'
import type { SettingsService } from '../services/settings-service.js'
import type { UpdaterService } from '../services/updater-service.js'

export interface AppContext {
  converter: ConverterService
  settings: SettingsService
  updater: UpdaterService
  openable: OpenableRegistry
  dialog: typeof dialogService
}

/** Built once at boot. */
export function createContext(deps: {
  converter: ConverterService
  settings: SettingsService
  updater: UpdaterService
  openable: OpenableRegistry
}): AppContext {
  return {
    converter: deps.converter,
    settings: deps.settings,
    updater: deps.updater,
    openable: deps.openable,
    dialog: dialogService
  }
}
