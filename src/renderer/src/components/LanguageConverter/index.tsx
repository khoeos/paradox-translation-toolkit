import stellarisImg from '../../assets/img/stellaris.jpg'
import hoiImg from '../../assets/img/hoi4.jpg'
import eu4Img from '../../assets/img/eu4.jpg'
import ck3Img from '../../assets/img/ck3.jpg'

import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { Select, SelectTrigger } from '@renderer/components/ui/Select'
import { LANGUAGES, GAMES, ACTIVE_GAMES } from '@global/constants'
import { Switch } from '@renderer/components/ui/Switch'
import { FolderInput, Input } from '@renderer/components/ui/Input'
import { HelpCircleIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/Popover'
import useOptionsStore from '@renderer/store/options'
import { cn } from '@renderer/lib/utils'
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/Dialog'
import {
  ConversionOutput,
  ConversionStatus,
  ConversionStatusType,
  ConvertMode,
  IpcKey,
  TranslateProvider,
  LogValues,
  ModResult,
  ScanOutput,
  TranslationCounters
} from '@global/types'
import ModList from './ModList'
import TranslateSettings from './TranslateSettings'
import { ScrollArea, ScrollBar } from '@renderer/components/ui/ScrollArea'
import { format } from 'date-fns'
import { Progress } from '@renderer/components/ui/Progress'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from '@renderer/components/ui/Accordion'

interface Log {
  message: string
  ts: number
  values?: LogValues
}

interface ModProgress {
  current: number
  total: number
  modName: string
}

const statusTranslation = {
  [ConversionStatus.WAITING]: 'status.waiting',
  [ConversionStatus.STARTED]: 'status.started',
  [ConversionStatus.SCANNING_FILES]: 'status.scanning',
  [ConversionStatus.COMPARING_FILES]: 'status.comparing',
  [ConversionStatus.PROCESSING_MODS]: 'status.processing',
  [ConversionStatus.CREATING_FILES]: 'status.creating',
  [ConversionStatus.FINISHED]: 'status.finished',
  [ConversionStatus.SCAN_FINISHED]: 'status.finished',
  [ConversionStatus.CANCELLED]: 'status.cancelled',
  [ConversionStatus.ERROR]: 'status.error'
}

/** Keep only the meaningful end of a path: mod folder, localisation folder and below */
const shortFileName = (file: string, translateKey: string): string => {
  const segments = file.split(/[\\/]+/)
  const locIndex = segments.map((segment) => segment.toLowerCase()).lastIndexOf(translateKey)
  const from = locIndex > 0 ? locIndex - 1 : Math.max(0, segments.length - 3)
  return segments.slice(from).join('\\')
}

export default function LanguageConverter(): JSX.Element {
  const [modalOpen, setModalOpen] = useState(false)
  const [conversionStatus, setConversionStatus] = useState(ConversionStatus.WAITING)
  const [logs, setLogs] = useState<Log[]>([])
  const [output, setOutput] = useState<ConversionOutput | null>(null)
  const [modProgress, setModProgress] = useState<ModProgress | null>(null)
  const [translationCounters, setTranslationCounters] = useState<TranslationCounters | null>(null)
  const [error, setError] = useState<string>('')
  const [startedAt, setStartedAt] = useState(0)
  const [now, setNow] = useState(0)
  const [canConvert, setCanConvert] = useState(false)

  const isDone =
    conversionStatus === ConversionStatus.FINISHED ||
    conversionStatus === ConversionStatus.CANCELLED ||
    conversionStatus === ConversionStatus.ERROR

  const handleCloseModal = (): void => {
    if (!isDone) return
    setLogs(() => [])
    setOutput(null)
    setModProgress(null)
    setTranslationCounters(null)
    setError('')
    setModalOpen(false)
    setConversionStatus(ConversionStatus.WAITING)
  }

  const handleStatusUpdate = (statusUpdate): void => {
    if (statusUpdate.type === ConversionStatusType.STATUS) {
      if (statusUpdate.status === ConversionStatus.SCAN_FINISHED) {
        // The scan feeds the picker, there is nothing to show in the modal
        const scan = statusUpdate.output as ScanOutput
        setScannedMods(scan.mods)
        setSelectedMods(scan.mods.filter((mod) => mod.missingFiles > 0).map((mod) => mod.id))
        setModalOpen(false)
        setConversionStatus(ConversionStatus.WAITING)
        setModProgress(null)
        return
      }

      setConversionStatus(statusUpdate.status)

      if (statusUpdate.status === ConversionStatus.FINISHED) {
        const result = statusUpdate.output as ConversionOutput
        setOutput(result)
        if (result.cancelled) setConversionStatus(ConversionStatus.CANCELLED)
      } else if (statusUpdate.status === ConversionStatus.ERROR) {
        setError(String(statusUpdate.error ?? ''))
      }
    } else if (statusUpdate.type === ConversionStatusType.PROGRESS) {
      setModProgress({
        current: statusUpdate.current,
        total: statusUpdate.total,
        modName: statusUpdate.modName
      })
      if (statusUpdate.translation) setTranslationCounters(statusUpdate.translation)
    } else if (statusUpdate.type === ConversionStatusType.LOG) {
      setLogs((prev) => [
        ...prev,
        { ts: statusUpdate.ts, message: statusUpdate.message, values: statusUpdate?.values }
      ])
    } else {
      console.warn('Unknown status update', statusUpdate)
    }
  }

  const buildRequest = (): Record<string, unknown> => ({
    path,
    outputPath,
    modName,
    mode,
    game,
    sourceLanguage: GAMES[game].languageKeys[sourceLanguage],
    targetLanguages: targetLanguage.map((lang) => GAMES[game].languageKeys[lang]),
    checkFiles,
    translate
  })

  const resetRun = (): void => {
    setLogs(() => [])
    setOutput(null)
    setModProgress(null)
    setTranslationCounters(null)
    setError('')
    setStartedAt(Date.now())
    setNow(Date.now())
    setModalOpen(true)
  }

  const ipcHandleScan = (): void => {
    resetRun()
    window.electron.ipcRenderer.send(IpcKey.SCAN_START, buildRequest())
  }

  const ipcHandleTranslation = (): void => {
    resetRun()
    window.electron.ipcRenderer.send(IpcKey.CONVERT_START, {
      ...buildRequest(),
      selectedMods
    })
  }
  const { t } = useTranslation()
  const {
    game,
    path,
    outputPath,
    modName,
    sourceLanguage,
    targetLanguage,
    mode,
    checkFiles,
    deepCheck,
    translate,
    scannedMods,
    selectedMods,
    setGame,
    setPath,
    setOutputPath,
    setModName,
    setLanguage,
    setMode,
    setCheckFiles,
    setDeepCheck,
    setScannedMods,
    setSelectedMods,
    toggleSelectedMod
  } = useOptionsStore()

  const gameImg = {
    stl: stellarisImg,
    hoi4: hoiImg,
    eu4: eu4Img,
    ck3: ck3Img
  }

  useEffect(() => {
    setLogs(() => [])
    window.api.on(IpcKey.CONVERT_STATUS, (status) => handleStatusUpdate(status))
    window.api.on(IpcKey.SELECT_FOLDER_RESULT, (result) => setPath(result as string))
    window.api.on(IpcKey.SELECT_OUTPUT_RESULT, (result) => setOutputPath(result as string))
  }, [])

  useEffect(() => {
    const canConvert =
      path !== '' &&
      targetLanguage.length > 0 &&
      (mode !== ConvertMode.EXTRACT_TO_FOLDER || outputPath !== '') &&
      (mode !== ConvertMode.CREATE_TRANSLATION_MOD || modName.trim() !== '') &&
      (!translate.enabled ||
        translate.provider === TranslateProvider.RAPIDAPI ||
        translate.model.trim() !== '')
    setCanConvert(canConvert)
  }, [
    path,
    targetLanguage,
    mode,
    outputPath,
    modName,
    translate.enabled,
    translate.model,
    translate.provider
  ])

  // A run lasting hours needs a clock, not just a bar
  useEffect(() => {
    if (!modalOpen || isDone) return
    const tick = setInterval(() => setNow(Date.now()), 1000)
    return (): void => clearInterval(tick)
  }, [modalOpen, isDone])

  // How many strings this run is expected to handle, known from the scan
  const expectedLines = scannedMods
    .filter((mod) => selectedMods.includes(mod.id))
    .reduce((sum, mod) => sum + mod.missingLines, 0)

  const handled = translationCounters
    ? translationCounters.translated + translationCounters.cached + translationCounters.failed
    : 0
  const elapsed = startedAt ? Math.max(0, Math.round((now - startedAt) / 1000)) : 0
  const rate = elapsed > 0 && handled > 0 ? handled / elapsed : 0
  const remaining = rate > 0 && expectedLines > handled ? (expectedLines - handled) / rate : 0

  const formatDuration = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)} s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`
    return `${Math.floor(seconds / 3600)} h ${Math.round((seconds % 3600) / 60)} min`
  }

  // Discovery is worth a few percent, the rest follows the mods actually done
  const progress = isDone
    ? 100
    : translationCounters && expectedLines > 0
      ? 5 + Math.min(95, Math.round((95 * handled) / expectedLines))
      : modProgress && modProgress.total > 0
        ? 5 + Math.round((95 * modProgress.current) / modProgress.total)
        : 5

  const reportedMods = output?.mods.filter((mod) => mod.createdCount > 0 || mod.errors.length > 0)

  const renderModFiles = (mod: ModResult): JSX.Element => (
    <ul className={'pl-4'}>
      {Object.keys(mod.created).map((lang) => (
        <li key={lang}>
          <span className={'text-amber-500'}>{t(`languages.${lang}`, lang)}</span>
          <ul className={'pl-4'}>
            {mod.created[lang].map((file, index) => {
              const splitted = file.split(/[\\/]+/)
              const fileFolderPath = splitted.slice(0, -1).join('\\')
              return (
                <li key={index}>
                  <p
                    className="max-w-full my-px overflow-hidden truncate cursor-pointer whitespace-nowrap text-ellipsis hover:underline"
                    onClick={() =>
                      window.electron.ipcRenderer.send(IpcKey.OPEN_FOLDER, fileFolderPath)
                    }
                    title={file}
                  >
                    {shortFileName(file, GAMES[game].translateKey)}
                  </p>
                </li>
              )
            })}
          </ul>
        </li>
      ))}
      {mod.truncated > 0 && (
        <li className={'text-gray-400'}>{t('MoreFiles', { count: mod.truncated })}</li>
      )}
      {mod.errors.length > 0 && (
        <li>
          <span className={'text-red-400'}>{t('Errors')}</span>
          <ul className={'pl-4 text-red-300'}>
            {mod.errors.slice(0, 20).map((message, index) => (
              <li key={index} className={'truncate'} title={message}>
                {message}
              </li>
            ))}
          </ul>
        </li>
      )}
    </ul>
  )

  return (
    <>
      <div
        className={'h-full w-full fixed -z-50 bg-cover'}
        style={{ backgroundImage: `url(${gameImg[game] || ''})` }}
      />
      <div className={'grid grid-cols-12 gap-8 p-8'}>
        <Card className={'col-span-12 font-semibold tracking-wide flex justify-center pt-2 pb-4'}>
          <div className={'flex gap-8 justify-center items-center'}>
            {ACTIVE_GAMES.map((activeGame) => (
              <div
                key={activeGame}
                className={cn(
                  'py-2 dark:text-white/80 cursor-pointer',
                  game === GAMES[activeGame].key
                    ? 'border-amber-600 border-b-2 text-amber-600 dark:text-amber-500'
                    : ''
                )}
                onClick={() => setGame(GAMES[activeGame].key)}
              >
                <h2>{GAMES[activeGame].name}</h2>
              </div>
            ))}
          </div>
        </Card>

        <Card className={'col-span-7'}>
          <CardContent>
            <div className={'mb-4 mt-2'}>
              <h2 className={'text-xl font-semibold tracking-wide mb-2 flex items-center gap-2'}>
                {t('ModFolder')}
                <Popover>
                  <PopoverTrigger>
                    <HelpCircleIcon className={'text-gray-300/80 mt-1'} />
                  </PopoverTrigger>
                  <PopoverContent className={'text-sm w-[50vw]'}>
                    <p>{t('ModFolderDescription')}</p>
                  </PopoverContent>
                </Popover>
              </h2>
              <FolderInput
                ipc={IpcKey.SELECT_FOLDER_START}
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder={`C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\${GAMES[game].id}`}
                className={path === '' ? 'border border-red-500/60' : ''}
              />
              <p className={'mt-1 text-xs text-gray-300/80'}>{t('BatchHint')}</p>
            </div>
            <div className={'mb-4'}>
              <h2 className={'text-xl font-semibold tracking-wide mb-2 flex items-center gap-2'}>
                {t('Mode')}
                <Popover>
                  <PopoverTrigger>
                    <HelpCircleIcon className={'text-gray-300/80 mt-1'} />
                  </PopoverTrigger>
                  <PopoverContent className={'text-sm w-[50vw]'}>
                    <p className={'mb-2'}>{t('ModeDescription.0')}</p>
                    <ul className={'space-y-1'}>
                      <li>
                        <span className="mr-1 font-semibold text-gray-300">
                          {t('AddToCurrent')} :
                        </span>
                        {t('ModeDescription.1')}
                      </li>
                      <li>
                        <span className="mr-1 font-semibold text-gray-300">
                          {t('ExtractToFolder')} :
                        </span>

                        {t('ModeDescription.2')}
                      </li>
                      <li>
                        <span className="mr-1 font-semibold text-gray-300">
                          {t('CreateTranslationMod')} :
                        </span>

                        {t('ModeDescription.3')}
                      </li>
                    </ul>
                  </PopoverContent>
                </Popover>
              </h2>
              <div className={'grid grid-cols-3 gap-2'}>
                <Button
                  className={cn(
                    'bg-gray-900 font-semibold tracking-wide rounded flex items-center justify-center text-center p-2 text-white whitespace-normal hover:text-gray-800 h-auto',
                    mode === ConvertMode.ADD_TO_CURRENT && 'bg-amber-600'
                  )}
                  onClick={() => setMode(ConvertMode.ADD_TO_CURRENT)}
                >
                  {t('AddToCurrent')}
                </Button>
                <Button
                  className={cn(
                    'bg-gray-900 font-semibold tracking-wide rounded flex items-center justify-center text-center p-2 text-white whitespace-normal hover:text-gray-800 h-auto',
                    mode === ConvertMode.EXTRACT_TO_FOLDER && 'bg-amber-600'
                  )}
                  onClick={() => setMode(ConvertMode.EXTRACT_TO_FOLDER)}
                >
                  {t('ExtractToFolder')}
                </Button>
                <Button
                  className={cn(
                    'bg-gray-900 font-semibold tracking-wide rounded flex items-center justify-center text-center p-2 text-white whitespace-normal hover:text-gray-800 h-auto',
                    mode === ConvertMode.CREATE_TRANSLATION_MOD && 'bg-amber-600'
                  )}
                  onClick={() => setMode(ConvertMode.CREATE_TRANSLATION_MOD)}
                >
                  {t('CreateTranslationMod')}
                </Button>
              </div>
              {mode === ConvertMode.EXTRACT_TO_FOLDER && (
                <FolderInput
                  ipc={IpcKey.SELECT_OUTPUT_START}
                  value={outputPath}
                  onChange={(e) => setOutputPath(e.target.value)}
                  placeholder={'D:\\Translation'}
                  className={outputPath === '' ? 'border border-red-500/60' : ''}
                />
              )}
              {mode === ConvertMode.CREATE_TRANSLATION_MOD && (
                <div className={'mt-2'}>
                  <Input
                    value={modName}
                    onChange={(e) => setModName(e.target.value)}
                    placeholder={'Missing Translations'}
                    className={modName.trim() === '' ? 'border border-red-500/60' : ''}
                  />
                  <p className={'mt-1 text-xs text-gray-300/80'}>{t('TranslationModHint')}</p>
                </div>
              )}
            </div>
            <div>
              <h2 className={'text-xl font-semibold tracking-wide mb-2'}>{t('Options')}</h2>
              <div>
                <ul className={'space-y-2'}>
                  <li className={'flex items-center gap-2'}>
                    <Popover>
                      <PopoverTrigger>
                        <HelpCircleIcon className={'text-gray-300/80'} />
                      </PopoverTrigger>
                      <PopoverContent className={'text-sm'}>
                        {t('CheckFilesBeforeCreationDesc')}
                      </PopoverContent>
                    </Popover>
                    {t('CheckFilesBeforeCreation')}
                    <Switch
                      checked={checkFiles}
                      onCheckedChange={(value) => setCheckFiles(value)}
                      disabled
                    />
                  </li>
                  <li className={'flex items-center gap-2'}>
                    <Popover>
                      <PopoverTrigger>
                        <HelpCircleIcon className={'text-gray-300/80'} />
                      </PopoverTrigger>
                      <PopoverContent className={'text-sm '}>
                        <p className={'mb-2'}>{t('DeepCheckDesc')}</p>
                        <p className={'font-semibold tracking-wide text-red-200'}>
                          {t('DeepCheckWarn')}
                        </p>
                      </PopoverContent>
                    </Popover>
                    {t('DeepCheck')}
                    <Switch
                      checked={deepCheck}
                      onCheckedChange={(value) => setDeepCheck(value)}
                      disabled
                    />
                  </li>
                  <li></li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className={'col-span-5'}>
          <CardContent>
            <div className={'mb-4'}>
              <h2 className={'text-xl font-semibold tracking-wide mb-2 mt-2'}>
                {t('SourceLanguage')}
              </h2>
              <Select disabled>
                <SelectTrigger>{t('languages.en')}</SelectTrigger>
              </Select>
            </div>
            <div>
              <h2 className={cn('text-xl font-semibold tracking-wide mb-4 flex items-center')}>
                {t('TargetLanguage')}
              </h2>
              <ul className={'grid grid-cols-2 gap-y-3 items-center gap-x-12 relative'}>
                {Object.keys(LANGUAGES).map((lang) => (
                  <li key={lang} className={'flex justify-between items-center'}>
                    {t(`languages.${lang}`)}

                    <Switch
                      disabled={sourceLanguage === lang}
                      checked={targetLanguage.includes(lang)}
                      onCheckedChange={(value) => setLanguage(lang, value)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>
        <TranslateSettings />

        <Button
          className={'col-span-4 w-full bg-gray-900 text-white tracking-wide hover:text-gray-800'}
          onClick={ipcHandleScan}
          disabled={!canConvert}
        >
          {t('ScanMods')}
        </Button>
        <Button
          className={'col-span-8 w-full bg-amber-600 text-white tracking-wide hover:text-gray-800'}
          onClick={ipcHandleTranslation}
          disabled={!canConvert || (scannedMods.length > 0 && selectedMods.length === 0)}
        >
          {scannedMods.length > 0
            ? t('ConvertSelected', { count: selectedMods.length })
            : t('ConvertTranslations')}
        </Button>

        {scannedMods.length > 0 && (
          <ModList
            mods={scannedMods}
            selected={selectedMods}
            onSelect={setSelectedMods}
            onToggle={toggleSelectedMod}
            withEstimate={translate.enabled}
            translateKey={GAMES[game].translateKey}
            provider={translate.provider}
          />
        )}
        <Dialog open={modalOpen}>
          <DialogContent
            closable={false}
            onPointerDownOutside={handleCloseModal}
            onEscapeKeyDown={handleCloseModal}
            onInteractOutside={handleCloseModal}
            className={'max-w-2xl'}
          >
            <DialogHeader>
              <DialogTitle>
                {t(statusTranslation[conversionStatus] ?? 'status.waiting')}
              </DialogTitle>
            </DialogHeader>

            {!isDone && (
              <>
                <Progress value={progress} />
                {modProgress && (
                  <p className={'text-sm text-gray-300 truncate'} title={modProgress.modName}>
                    {t('ModsProcessed', {
                      current: modProgress.current,
                      total: modProgress.total
                    })}
                    {' — '}
                    {modProgress.modName}
                  </p>
                )}
                {translationCounters && (
                  <p className={'text-sm text-amber-500'}>
                    {t('TranslationProgress', translationCounters)}
                    {expectedLines > 0 && ` — ${handled} / ${expectedLines}`}
                  </p>
                )}
                <p className={'text-sm text-gray-400'}>
                  {t('Elapsed', { time: formatDuration(elapsed) })}
                  {rate > 0 && ` · ${rate.toFixed(1)} ${t('PerSecond')}`}
                  {remaining > 0 && ` · ${t('Remaining', { time: formatDuration(remaining) })}`}
                </p>
                <Button
                  className={'bg-gray-900 text-white hover:text-gray-800'}
                  onClick={() => window.electron.ipcRenderer.send(IpcKey.CONVERT_CANCEL)}
                >
                  {t('Cancel')}
                </Button>
              </>
            )}

            {conversionStatus === ConversionStatus.ERROR && (
              <p className={'text-sm text-red-300'}>{error}</p>
            )}

            {output && (
              <div className={'text-sm'}>
                <p>
                  {t('SummaryLine', {
                    created: output.totals.created,
                    mods: output.totals.modsWithFiles,
                    scanned: output.totals.mods
                  })}
                </p>
                {(output.totals.skipped > 0 || output.totals.failed > 0) && (
                  <p className={'text-gray-400'}>
                    {t('SummaryDetails', {
                      skipped: output.totals.skipped,
                      failed: output.totals.failed
                    })}
                  </p>
                )}
                {output.translation && (
                  <p className={'text-amber-500'}>{t('TranslationProgress', output.translation)}</p>
                )}
                {output.cancelled && <p className={'text-red-300'}>{t('RunCancelled')}</p>}
                {output.translationMod && output.totals.created > 0 && (
                  <>
                    <p className={'mt-2'}>
                      {t('TranslationModCreated', {
                        name: output.translationMod.name,
                        version: output.translationMod.supportedVersion
                      })}
                    </p>
                    <p
                      className={'text-amber-500 truncate cursor-pointer hover:underline'}
                      title={output.translationMod.path}
                      onClick={() =>
                        window.electron.ipcRenderer.send(
                          IpcKey.OPEN_FOLDER,
                          output.translationMod?.path
                        )
                      }
                    >
                      {output.translationMod.path}
                    </p>
                    <p className={'text-gray-400'}>{t('TranslationModLoadOrder')}</p>
                  </>
                )}
              </div>
            )}

            {reportedMods && reportedMods.length > 0 && (
              <ScrollArea
                className={
                  'max-w-full border rounded max-h-64 px-2 py-1 bg-gray-900 border-gray-700'
                }
              >
                <code className={'flex flex-col w-full'}>
                  <Accordion type={'multiple'}>
                    {reportedMods.map((mod) => (
                      <AccordionItem key={mod.id} value={mod.id}>
                        <AccordionTrigger className={'py-2 text-left'}>
                          <span className={'truncate mr-2'} title={mod.path}>
                            {mod.name}
                          </span>
                          <span className={'ml-auto mr-2 shrink-0 text-gray-400'}>
                            {mod.createdCount > 0 && t('FilesCount', { count: mod.createdCount })}
                            {mod.translation && (
                              <span className={'ml-2 text-amber-500/80'}>
                                {t('TranslationProgress', mod.translation)}
                              </span>
                            )}
                            {mod.errors.length > 0 && (
                              <span className={'ml-2 text-red-400'}>
                                {t('ErrorsCount', { count: mod.errors.length })}
                              </span>
                            )}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent>{renderModFiles(mod)}</AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </code>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            )}

            {output && reportedMods?.length === 0 && (
              <p className={'text-sm text-gray-400'}>{t('NothingToCreate')}</p>
            )}

            {logs.length > 0 && (
              <ScrollArea className={'w-full border rounded  bg-gray-900 border-gray-700'}>
                <ScrollArea className={'h-32 px-2 py-1 '}>
                  <code className={'flex flex-col'}>
                    {logs.map((log, index) => (
                      <div key={index} className={'flex items-center'}>
                        <span className={'w-32 block'}>
                          {format(new Date(log.ts), 'HH:mm:ss.SSS')}
                        </span>
                        <span className={'block'}>{t(log.message, log.values)}</span>
                      </div>
                    ))}
                  </code>
                </ScrollArea>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            )}
            {isDone && <Button onClick={handleCloseModal}>{t('Close')}</Button>}
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}
