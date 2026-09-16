import { useTranslation } from 'react-i18next'

import type { ParsedRunReport } from '@ptt/report'
import { Card, CardContent, CardHeader } from '@ptt/ui/components/card'

import {
  getLanguageLabel,
  getModeLabel,
  getTargetContentLabel
} from '@renderer/components/runs/labels'

interface RunSettingsCardProps {
  report: Omit<ParsedRunReport, 'untranslated'>
  gameLabel: string
}

export function RunSettingsCard({ report, gameLabel }: RunSettingsCardProps) {
  const { t } = useTranslation()
  const { request, translationMod } = report

  const modsSelectedLabel =
    request.selectedMods === 'all'
      ? t('runs.report.settings.modsSelectedAll')
      : t('runs.report.settings.modsSelected', { count: request.selectedMods })

  const translateLabel =
    request.translate !== undefined
      ? `${request.translate.provider} · ${request.translate.model}`
      : t('runs.report.settings.translateOff')

  const rows: { label: string; value: string }[] = [
    { label: t('runs.report.settings.game'), value: gameLabel },
    { label: t('runs.report.settings.folder'), value: request.path },
    { label: t('runs.report.settings.mode'), value: getModeLabel(t, request.mode) },
    {
      label: t('runs.report.settings.whatToWrite'),
      value: getTargetContentLabel(t, request.targetContent) || '-'
    },
    {
      label: t('runs.report.settings.sourceLanguage'),
      value: getLanguageLabel(t, request.sourceLanguage)
    },
    {
      label: t('runs.report.settings.targetLanguages'),
      value: request.targetLanguages.map(code => getLanguageLabel(t, code)).join(', ')
    },
    { label: t('runs.report.settings.modsSelectedLabel'), value: modsSelectedLabel },
    { label: t('runs.report.settings.machineTranslation'), value: translateLabel }
  ]

  if (translationMod !== undefined) {
    rows.push(
      {
        label: t('runs.report.settings.generatedMod'),
        value: `${translationMod.name} · ${translationMod.folder}`
      },
      { label: t('runs.report.settings.modPath'), value: translationMod.path },
      { label: t('runs.report.settings.gameVersion'), value: translationMod.supportedVersion }
    )
  }

  return (
    <Card className="py-0! overflow-hidden">
      <CardHeader className="border-b py-3!">
        <div className="font-semibold text-sm">{t('runs.report.settings.title')}</div>
      </CardHeader>
      <CardContent className="px-0! py-1!">
        {rows.map(row => (
          <div
            key={row.label}
            className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 border-b px-4 py-2 last:border-b-0"
          >
            <div className="text-xs text-muted-foreground">{row.label}</div>
            <div className="break-all font-mono text-xs text-foreground">{row.value}</div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
