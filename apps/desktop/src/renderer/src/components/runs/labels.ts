import type { useTranslation } from 'react-i18next'

import type { RunOutcome } from '@ptt/report'
import type { ConvertMode, TargetContent } from '@ptt/shared'

import type { DayBucket } from '@renderer/lib/format-datetime'
import type { RunErrorCategory } from '@renderer/lib/run-errors'

export type Translate = ReturnType<typeof useTranslation>['t']

export const getModeLabel = (t: Translate, mode: ConvertMode): string => {
  switch (mode) {
    case 'add-to-current':
      return t('converter.modes.addToCurrent')
    case 'extract-to-folder':
      return t('converter.modes.extractToFolder')
    case 'create-translation-mod':
      return t('converter.modes.createTranslationMod')
  }
}

export const getTargetContentLabel = (
  t: Translate,
  targetContent: TargetContent | undefined
): string => {
  switch (targetContent) {
    case 'missing-keys':
      return t('converter.targetContents.missingKeys')
    case 'complete-file':
      return t('converter.targetContents.completeFile')
    case 'regenerate-file':
      return t('converter.targetContents.regenerateFile')
    case undefined:
      return ''
  }
}

export const getLanguageLabel = (t: Translate, code: string): string =>
  t(`languages.${code}`, { defaultValue: code })

export const getOutcomeLabel = (t: Translate, outcome: RunOutcome): string => {
  switch (outcome) {
    case 'clean':
      return t('runs.history.outcome.clean')
    case 'issues':
      return t('runs.history.outcome.issues')
    case 'failed':
      return t('runs.history.outcome.failed')
    case 'cancelled':
      return t('runs.history.outcome.cancelled')
  }
}

export interface RunErrorCategoryLabels {
  tag: string
  title: string
  description: string
}

export const getErrorCategoryLabels = (
  t: Translate,
  category: RunErrorCategory
): RunErrorCategoryLabels => {
  switch (category) {
    case 'blocked':
      return {
        tag: t('runs.report.categories.blocked.tag'),
        title: t('runs.report.categories.blocked.title'),
        description: t('runs.report.categories.blocked.description')
      }
    case 'header':
      return {
        tag: t('runs.report.categories.header.tag'),
        title: t('runs.report.categories.header.title'),
        description: t('runs.report.categories.header.description')
      }
    case 'unterminated':
      return {
        tag: t('runs.report.categories.unterminated.tag'),
        title: t('runs.report.categories.unterminated.title'),
        description: t('runs.report.categories.unterminated.description')
      }
    case 'other':
      return {
        tag: t('runs.report.categories.other.tag'),
        title: t('runs.report.categories.other.title'),
        description: t('runs.report.categories.other.description')
      }
  }
}

export const getDayGroupLabel = (
  t: Translate,
  bucket: DayBucket,
  formattedDate: string,
  daysAgo: number
): string => {
  switch (bucket) {
    case 'today':
      return t('runs.history.day.today', { date: formattedDate })
    case 'yesterday':
      return t('runs.history.day.yesterday', { date: formattedDate })
    case 'recent':
      return t('runs.history.day.daysAgo', { count: daysAgo, date: formattedDate })
    case 'older':
      return t('runs.history.day.on', { date: formattedDate })
  }
}
