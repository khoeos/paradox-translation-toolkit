import type { RefusalReason } from '@ptt/translate'

export type Translate = (key: string, options: Record<string, unknown>) => string

type KnownRefusalReason = RefusalReason | 'identical'

const KNOWN_REFUSAL_REASONS = [
  'markup',
  'empty',
  'backend',
  'control',
  'identical'
] as const satisfies readonly KnownRefusalReason[]

const isKnownRefusalReason = (reason: string): reason is KnownRefusalReason =>
  KNOWN_REFUSAL_REASONS.some(known => known === reason)

const REASON_LABELS: Record<KnownRefusalReason, (t: Translate) => string> = {
  markup: t => t('runs.report.refusals.reasons.markup', {}),
  empty: t => t('runs.report.refusals.reasons.empty', {}),
  backend: t => t('runs.report.refusals.reasons.backend', {}),
  control: t => t('runs.report.refusals.reasons.control', {}),
  identical: t => t('runs.report.refusals.reasons.identical', {})
}

export const getRefusalReasonLabel = (t: Translate, reason: string): string =>
  isKnownRefusalReason(reason)
    ? REASON_LABELS[reason](t)
    : t('runs.report.refusals.reasons.unknown', { reason })
