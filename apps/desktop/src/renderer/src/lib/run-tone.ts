import type { RunOutcome } from '@ptt/report'

import type { RunErrorCategory } from './run-errors'

export interface OutcomeClasses {
  text: string
  dot: string
}

export interface ErrorCategoryClasses {
  text: string
}

const OUTCOME_CLASSES: Record<RunOutcome, OutcomeClasses> = {
  clean: { text: 'text-success', dot: 'bg-success' },
  issues: { text: 'text-warning', dot: 'bg-warning' },
  failed: { text: 'text-destructive', dot: 'bg-destructive' },
  cancelled: { text: 'text-muted-foreground', dot: 'bg-muted-foreground' }
}

const ERROR_CATEGORY_CLASSES: Record<RunErrorCategory, ErrorCategoryClasses> = {
  blocked: { text: 'text-destructive' },
  header: { text: 'text-sky-500' },
  unterminated: { text: 'text-warning' },
  other: { text: 'text-muted-foreground' }
}

export const getOutcomeClasses = (outcome: RunOutcome): OutcomeClasses => OUTCOME_CLASSES[outcome]

export const getErrorCategoryClasses = (category: RunErrorCategory): ErrorCategoryClasses =>
  ERROR_CATEGORY_CLASSES[category]

export const getCountClasses = (count: number, nonZeroText: string): string =>
  count > 0 ? nonZeroText : 'text-muted-foreground'
