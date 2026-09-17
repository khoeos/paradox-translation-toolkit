import { useTranslation } from 'react-i18next'

import { cn } from '@ptt/ui/lib/utils'

import { SeverityMarker } from '@renderer/components/SeverityMarker'
import { getLogSeverityStyle } from '@renderer/lib/log-severity'

interface TranslationCountersNoteProps {
  translated: number
  cached: number
  failed: number
}

export function TranslationCountersNote({
  translated,
  cached,
  failed
}: TranslationCountersNoteProps) {
  const { t } = useTranslation()
  const severity = failed > 0 ? 'warning' : undefined

  return (
    <p
      className={cn(
        'text-sm',
        severity ? getLogSeverityStyle(severity).className : 'text-muted-foreground'
      )}
    >
      <SeverityMarker severity={severity} />
      {t('modal.translationCounters', { translated, cached, failed })}
    </p>
  )
}
