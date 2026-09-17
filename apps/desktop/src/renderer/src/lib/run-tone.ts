import type { DiagnosticSeverity } from '@ptt/converter/progress'
import type { RunOutcome } from '@ptt/report'

import { getLogSeverityStyle } from './log-severity'
import type { RunErrorCategory } from './run-errors'

export interface OutcomeClasses {
  text: string
  dot: string
  marker: string
}

export interface ErrorCategoryClasses {
  text: string
}

interface OutcomeTone {
  text: string
  dot: string
  severity?: DiagnosticSeverity
}

const OUTCOME_TONES: Record<RunOutcome, OutcomeTone> = {
  clean: { text: 'text-success', dot: 'bg-success' },
  issues: { text: 'text-warning', dot: 'bg-warning', severity: 'warning' },
  failed: { text: 'text-destructive', dot: 'bg-destructive', severity: 'error' },
  cancelled: { text: 'text-muted-foreground', dot: 'bg-muted-foreground' }
}

const ERROR_CATEGORY_CLASSES: Record<RunErrorCategory, ErrorCategoryClasses> = {
  blocked: { text: 'text-destructive' },
  header: { text: 'text-sky-500' },
  unterminated: { text: 'text-warning' },
  other: { text: 'text-muted-foreground' }
}

export const getOutcomeClasses = (outcome: RunOutcome): OutcomeClasses => {
  const tone = OUTCOME_TONES[outcome]
  return { text: tone.text, dot: tone.dot, marker: getLogSeverityStyle(tone.severity).marker }
}

export const getErrorCategoryClasses = (category: RunErrorCategory): ErrorCategoryClasses =>
  ERROR_CATEGORY_CLASSES[category]

export const getCountClasses = (count: number, nonZeroText: string): string =>
  count > 0 ? nonZeroText : 'text-muted-foreground'
