import { useTranslation } from 'react-i18next'

import type { TargetContent } from '@ptt/shared'
import { Button } from '@ptt/ui/components/button'

import { useConverterFormStore } from '@renderer/store/converter-form'

const TARGET_CONTENT_VALUES: ReadonlyArray<TargetContent> = [
  'missing-keys',
  'complete-file',
  'regenerate-file'
]

const labelFor = (value: TargetContent, t: (key: string) => string): string => {
  if (value === 'missing-keys') return t('converter.targetContents.missingKeys')
  if (value === 'complete-file') return t('converter.targetContents.completeFile')
  return t('converter.targetContents.regenerateFile')
}

const hintFor = (value: TargetContent, t: (key: string) => string): string => {
  if (value === 'missing-keys') return t('converter.targetContents.missingKeysHint')
  if (value === 'complete-file') return t('converter.targetContents.completeFileHint')
  return t('converter.targetContents.regenerateFileHint')
}

export function TargetContentToggle() {
  const { t } = useTranslation()
  const targetContent = useConverterFormStore(s => s.targetContent)
  const setTargetContent = useConverterFormStore(s => s.setTargetContent)

  return (
    <div className="grid grid-cols-3 gap-2">
      {TARGET_CONTENT_VALUES.map(value => (
        <Button
          key={value}
          type="button"
          variant={targetContent === value ? 'default' : 'outline'}
          onClick={() => setTargetContent(value)}
          className="h-auto flex-col items-start py-3 text-left"
        >
          <span className="font-semibold tracking-wider">{labelFor(value, t)}</span>
          <span className="text-xs opacity-80 font-normal text-wrap">{hintFor(value, t)}</span>
        </Button>
      ))}
    </div>
  )
}
