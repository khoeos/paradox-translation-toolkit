import { tokensMatch } from '@ptt/parser'

export const PROBE_PLAIN = 'Colony Ship'

export const PROBE_MARKUP = 'Gain £gold£ and $VALUE$ prestige'

export const PROBE_TEXTS: readonly string[] = [PROBE_PLAIN, PROBE_MARKUP]

export const keptProbeMarkup = (answer: string): boolean => tokensMatch(PROBE_MARKUP, answer)
