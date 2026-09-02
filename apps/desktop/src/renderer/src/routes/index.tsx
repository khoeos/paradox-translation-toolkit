import { createRoute } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

import { Card, CardContent } from '@ptt/ui/components/card'
import { Input } from '@ptt/ui/components/input'
import { Label } from '@ptt/ui/components/label'

import { ModeToggle } from '@renderer/components/converter/ModeToggle'
import { ModList } from '@renderer/components/converter/ModList'
import { ProgressModal } from '@renderer/components/converter/ProgressModal'
import { RunButton } from '@renderer/components/converter/RunButton'
import { SourceLanguage } from '@renderer/components/converter/SourceLanguage'
import { TargetContentToggle } from '@renderer/components/converter/TargetContentToggle'
import { TargetLanguages } from '@renderer/components/converter/TargetLanguages'
import { TranslateSettings } from '@renderer/components/converter/TranslateSettings'
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
  const selectedGameId = useConverterFormStore(s => s.selectedGameId)
  const modName = useConverterFormStore(s => s.modName)
  const setModName = useConverterFormStore(s => s.setModName)

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
                  {mode === 'create-translation-mod' ? (
                    <div className="mt-2 space-y-1">
                      <Input
                        value={modName}
                        onChange={event => setModName(event.target.value)}
                        placeholder={t('converter.modNamePlaceholder')}
                      />
                      <p className="text-xs text-muted-foreground">{t('converter.modNameHint')}</p>
                    </div>
                  ) : null}
                </div>
                <TranslateSettings />
                <ModList />
                {mode === 'add-to-current' ? (
                  <div className="space-y-2 pt-1">
                    <Label>{t('converter.targetContent')}</Label>
                    <TargetContentToggle />
                  </div>
                ) : null}
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
