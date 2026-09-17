import { type UpdaterStatus } from '@ptt/shared/updater'

export const updaterStatusKey = (status: UpdaterStatus): string =>
  status === 'not-available' ? 'notAvailable' : status
