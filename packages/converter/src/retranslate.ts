import type { ConvertMode } from '@ptt/shared'

export const retranslateOwnKeysHasNoEffect = (mode: ConvertMode): boolean =>
  mode === 'add-to-current'
