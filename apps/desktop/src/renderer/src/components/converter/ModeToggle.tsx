import { useTranslation } from 'react-i18next'

import type { ConvertMode } from '@ptt/shared-types'
import { Button } from '@ptt/ui/components/button'

import { useConverterFormStore } from '@renderer/store/converter-form'

const MODES: ReadonlyArray<{ value: ConvertMode; labelKey: string; hintKey: string }> = [
  {
    value: 'add-to-current',
    labelKey: 'converter.modes.addToCurrent',
    hintKey: 'converter.modes.addToCurrentHint'
  },
  {
    value: 'extract-to-folder',
    labelKey: 'converter.modes.extractToFolder',
    hintKey: 'converter.modes.extractToFolderHint'
  }
]

export function ModeToggle() {
  const { t } = useTranslation()
  const mode = useConverterFormStore(s => s.mode)
  const setMode = useConverterFormStore(s => s.setMode)

  return (
    <div className="grid grid-cols-2 gap-2">
      {MODES.map(m => (
        <Button
          key={m.value}
          type="button"
          variant={mode === m.value ? 'default' : 'outline'}
          onClick={() => setMode(m.value)}
          className="h-auto flex-col items-start py-3 text-left"
        >
          <span className="font-semibold tracking-wider">{t(m.labelKey)}</span>
          <span className="text-xs opacity-80 font-normal text-wrap">{t(m.hintKey)}</span>
        </Button>
      ))}
    </div>
  )
}
