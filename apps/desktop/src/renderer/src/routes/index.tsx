import { createRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Card, CardContent } from '@ptt/ui/components/card'
import { Label } from '@ptt/ui/components/label'
import { Switch } from '@ptt/ui/components/switch'

import { ModeToggle } from '@renderer/components/converter/ModeToggle'
import { ProgressModal } from '@renderer/components/converter/ProgressModal'
import { RunButton } from '@renderer/components/converter/RunButton'
import { SourceLanguage } from '@renderer/components/converter/SourceLanguage'
import { TargetLanguages } from '@renderer/components/converter/TargetLanguages'
import { FolderInput } from '@renderer/components/FolderInput'
import { GameTabs } from '@renderer/components/GameTabs'
import { useConverterFormStore } from '@renderer/store/converter-form'

import { rootRoute } from './__root'

function ConverterPage() {
  const { t } = useTranslation()
  const modFolder = useConverterFormStore(s => s.modFolder)
  const setModFolder = useConverterFormStore(s => s.setModFolder)
  const outputFolder = useConverterFormStore(s => s.outputFolder)
  const setOutputFolder = useConverterFormStore(s => s.setOutputFolder)
  const mode = useConverterFormStore(s => s.mode)
  const overwrite = useConverterFormStore(s => s.overwrite)
  const setOverwrite = useConverterFormStore(s => s.setOverwrite)
  const selectedGameId = useConverterFormStore(s => s.selectedGameId)

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <GameTabs />

      {selectedGameId ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-8 gap-4">
            <Card className="bg-card/70! col-span-5 bg-opacity-50 backdrop-blur-sm">
              <CardContent className="pt-6 space-y-5">
                <div className="space-y-2">
                  <Label>{t('converter.modFolder')}</Label>
                  <FolderInput
                    value={modFolder}
                    onChange={setModFolder}
                    placeholder={t('converter.modFolderPlaceholder')}
                    className={modFolder === '' ? 'border-destructive/60' : ''}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t('converter.mode')}</Label>
                  <ModeToggle />
                  {mode === 'extract-to-folder' ? (
                    <FolderInput
                      value={outputFolder}
                      onChange={setOutputFolder}
                      placeholder={t('converter.outputFolderPlaceholder')}
                      className={outputFolder === '' ? 'border-destructive/60 mt-2' : 'mt-2'}
                    />
                  ) : null}
                </div>
                <div className="flex items-center justify-between gap-4 pt-1">
                  <div className="flex flex-col">
                    <Label htmlFor="overwrite-toggle">{t('converter.overwriteLabel')}</Label>
                    <span className="text-xs text-muted-foreground">
                      {t('converter.overwriteHint')}
                    </span>
                  </div>
                  <Switch
                    id="overwrite-toggle"
                    checked={overwrite}
                    onCheckedChange={setOverwrite}
                  />
                </div>
              </CardContent>
            </Card>

            <Card className="bg-card/70! col-span-3 bg-opacity-50 backdrop-blur-sm">
              <CardContent className="pt-6 space-y-5">
                <div className="space-y-2">
                  <Label>{t('converter.sourceLanguage')}</Label>
                  <SourceLanguage />
                </div>
                <div className="space-y-3">
                  <Label>{t('converter.targetLanguages')}</Label>
                  <TargetLanguages />
                </div>
              </CardContent>
            </Card>
          </div>

          <RunButton />
        </>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">{t('converter.noGameSelected')}</p>
          </CardContent>
        </Card>
      )}

      <ProgressModal />
    </div>
  )
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: ConverterPage
})
