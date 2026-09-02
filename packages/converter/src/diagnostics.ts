import type { Diagnostic } from '@ptt/parser'

export const DIAGNOSTIC_SEVERITIES = ['warning', 'error'] as const

export type DiagnosticSeverity = (typeof DIAGNOSTIC_SEVERITIES)[number]

export interface ModDiagnostic {
  severity: DiagnosticSeverity
  message: string
}

const PARSE_SEVERITY: Record<string, DiagnosticSeverity> = {
  'no-bom': 'warning',
  'no-header': 'warning',
  'missing-header': 'error',
  'expected-key': 'warning',
  'expected-colon': 'warning',
  'expected-quote': 'warning',
  'unterminated-string': 'error'
}

export const getParseSeverity = (code: string): DiagnosticSeverity =>
  PARSE_SEVERITY[code] ?? 'error'

export const hasUnreadableContent = (diagnostics: readonly Diagnostic[]): boolean =>
  diagnostics.some(diagnostic => getParseSeverity(diagnostic.code) === 'error')

export const splitDiagnostics = (
  diagnostics: readonly ModDiagnostic[]
): { errors: string[]; warnings: string[] } => {
  const errors: string[] = []
  const warnings: string[] = []
  for (const diagnostic of diagnostics) {
    if (diagnostic.severity === 'error') errors.push(diagnostic.message)
    else warnings.push(diagnostic.message)
  }
  return { errors, warnings }
}
