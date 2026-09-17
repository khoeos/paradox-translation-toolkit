import { useTranslation } from 'react-i18next'

import type { DiagnosticSeverity } from '@ptt/converter/progress'

import { getLogSeverityStyle } from '@renderer/lib/log-severity'

interface SeverityMarkerProps {
  severity: DiagnosticSeverity | undefined
}

export function SeverityMarker({ severity }: SeverityMarkerProps) {
  const { t } = useTranslation()
  if (severity === undefined) return null

  return (
    <>
      <span aria-hidden="true" className="mr-1">
        {getLogSeverityStyle(severity).marker}
      </span>
      <span className="sr-only">
        {severity === 'warning' ? t('common.warning') : t('common.error')}{' '}
      </span>
    </>
  )
}
