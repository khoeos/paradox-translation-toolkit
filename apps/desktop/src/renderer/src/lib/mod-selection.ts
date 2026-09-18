import type { ScannedMod } from '@ptt/converter'
import { sumByLanguage } from '@ptt/converter/totals'

export const selectedKeyCount = (
  mods: readonly ScannedMod[],
  selected: ReadonlySet<string>
): number =>
  mods.reduce((sum, mod) => (selected.has(mod.id) ? sum + sumByLanguage(mod.missingKeys) : sum), 0)
