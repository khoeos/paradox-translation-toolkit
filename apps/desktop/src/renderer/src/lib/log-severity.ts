import type { DiagnosticSeverity } from '@ptt/converter/progress'

export interface LogSeverityStyle {
  marker: string
  className: string
}

const SEVERITY_STYLES: Record<DiagnosticSeverity, LogSeverityStyle> = {
  warning: { marker: '!', className: 'text-amber-600 dark:text-amber-500' },
  error: { marker: '×', className: 'text-destructive' }
}

const PLAIN: LogSeverityStyle = { marker: '', className: '' }

export const getLogSeverityStyle = (severity?: DiagnosticSeverity): LogSeverityStyle =>
  severity ? SEVERITY_STYLES[severity] : PLAIN
