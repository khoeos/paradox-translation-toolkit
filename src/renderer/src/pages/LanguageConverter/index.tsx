import stellarisImg from '../../assets/img/stellaris.jpg'
import hoiImg from '../../assets/img/hoi4.jpg'
import eu4Img from '../../assets/img/eu4.jpg'
import ck3Img from '../../assets/img/ck3.jpg'

import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/button'
import { Select, SelectTrigger } from '@renderer/components/ui/select'
import { LANGUAGES, GAMES, ACTIVE_GAMES } from '@global/constants'
import { Switch } from '@renderer/components/ui/Switch'
import { FolderInput } from '@renderer/components/ui/input'
import { HelpCircleIcon } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/popover'
import useOptionsStore from '@renderer/store/options'
import { cn } from '@renderer/lib/utils'
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@renderer/components/ui/dialog'
import { ConversionStatus, ConversionStatusType, ConvertMode, IpcKey } from '@global/types'
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
  data?: unknown
}

interface Output {
  [key: string]: {
    createdFiles: string[]
  }
}

const statusTranslation = {
  [ConversionStatus.WAITING]: 'Waiting',
  [ConversionStatus.SCANNING_FILES]: 'Scanning files',
  [ConversionStatus.COMPARING_FILES]: 'Comparing files',
  [ConversionStatus.CREATING_FILES]: 'Creating files',
  [ConversionStatus.FINISHED]: 'Finished'
}

export default function LanguageConverter(): JSX.Element {
  const [modalOpen, setModalOpen] = useState(false)
  const [conversionStatus, setConversionStatus] = useState(ConversionStatus.WAITING)
  const [logs, setLogs] = useState<Log[]>([])
  const [output, setOutput] = useState<Output>({})
  const [progress, setProgress] = useState(0)
  const [canConvert, setCanConvert] = useState(false)

  const handleCloseModal = (): void => {
    if (conversionStatus === ConversionStatus.FINISHED) {
      setLogs(() => [])
      setOutput({})
      setModalOpen(false)
      setConversionStatus(ConversionStatus.WAITING)
    }
  }

  const handleStatusUpdate = (statusUpdate): void => {
    if (statusUpdate.type === ConversionStatusType.STATUS) {
      setConversionStatus(statusUpdate.status)
      switch (statusUpdate.status) {
        case ConversionStatus.SCANNING_FILES:
          setProgress(25)
          break
        case ConversionStatus.COMPARING_FILES:
          setProgress(50)
          break
        case ConversionStatus.CREATING_FILES:
          setProgress(75)
          break
        case ConversionStatus.FINISHED:
          setProgress(100)
          break
        default:
          break
      }

      if (statusUpdate.status === ConversionStatus.FINISHED) {
        setOutput(statusUpdate.output)
        console.log('Finished', statusUpdate.output)
      }
    } else if (statusUpdate.type === ConversionStatusType.LOG) {
      setLogs((prev) => [
        ...prev,

        { ts: statusUpdate.ts, message: statusUpdate.message, data: statusUpdate?.data ?? {} }
      ])
    } else {
      console.warn('Unknown status update', statusUpdate)
    }
  }

  const ipcHandleTranslation = (): void => {
    setLogs(() => [])
    const request = {
      path,
      outputPath,
      mode,
      game,
      sourceLanguage: GAMES[game].languageKeys[sourceLanguage],
      targetLanguages: targetLanguage.map((lang) => GAMES[game].languageKeys[lang]),
      checkFiles
    }

    setModalOpen(true)
    window.electron.ipcRenderer.send(IpcKey.CONVERT_START, request)
  }
  const { t } = useTranslation()
  const {
    game,
    path,
    outputPath,
    sourceLanguage,
    targetLanguage,
    mode,
    checkFiles,
    deepCheck,
    setGame,
    setPath,
    setOutputPath,
    setLanguage,
    setMode,
    setCheckFiles,
    setDeepCheck
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
      (mode !== ConvertMode.EXTRACT_TO_FOLDER || outputPath !== '')
    setCanConvert(canConvert)
  }, [path, targetLanguage, mode, outputPath])

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
                placeholder={'C:\\Program Files (x86)\\Steam\\steamapps\\workshop\\content\\281990'}
                className={path === '' ? 'border border-red-500/60' : ''}
              />
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
                  disabled
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
                  className={path === '' ? 'border border-red-500/60' : ''}
                />
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
            {/* <div>
                <h2 className={'text-xl font-semibold tracking-wide mb-4'}>
                  <Trans>Output type</Trans>
                </h2>
              </div> */}
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
                {/* <li className={'flex justify-between'}>
                    <Trans>languages.custom</Trans>
                    <HelpCircleIcon className={'text-gray-200'} />
                    <Switch />
                  </li>
                  <li>
                    <Input />
                  </li> */}
              </ul>
            </div>
          </CardContent>
        </Card>
        <Button
          className={'col-span-12 w-full bg-amber-600 text-white tracking-wide hover:text-gray-800'}
          onClick={ipcHandleTranslation}
          disabled={!canConvert}
        >
          {t('ConvertTranslations')}
        </Button>
        <Dialog open={modalOpen}>
          <DialogContent
            closable={false}
            onPointerDownOutside={handleCloseModal}
            onEscapeKeyDown={handleCloseModal}
            onInteractOutside={handleCloseModal}
            className={'max-w-2xl'}
          >
            <DialogHeader>
              <DialogTitle>{statusTranslation[conversionStatus]}</DialogTitle>
            </DialogHeader>
            {conversionStatus !== ConversionStatus.FINISHED && <Progress value={progress} />}

            {Object.keys(output).length > 0 && (
              <ScrollArea
                className={
                  'max-w-full border rounded max-h-64 px-2 py-1 bg-gray-900 border-gray-700'
                }
              >
                <code className={'flex flex-col w-full'}>
                  <div>Files Created :</div>
                  <ul className={'pl-4'}>
                    {Object.keys(output).map((lang) => (
                      <li key={lang}>
                        <Accordion type={'single'} collapsible={true}>
                          <AccordionItem value={lang}>
                            <AccordionTrigger>{lang}</AccordionTrigger>
                            <AccordionContent>
                              <ul className={'pl-4'}>
                                {output[lang].createdFiles.map((file, index) => {
                                  const splitted = file.split('\\')
                                  const fileFolderPath = splitted
                                    .slice(0, splitted.length - 1)
                                    .join('\\')
                                  const localisationIndex = splitted.indexOf(
                                    GAMES[game].translateKey
                                  )
                                  const fullfileName = `\\${splitted.slice(localisationIndex - 1).join('\\')}`
                                  let fileName = fullfileName
                                  if (fullfileName.length > 60) {
                                    const modFolder = splitted[localisationIndex - 1]
                                    const fileNameWithExt = splitted[splitted.length - 1]

                                    const keepLength = Math.floor(
                                      (60 - (fileNameWithExt.length + 2 + modFolder.length + 3)) / 2
                                    )
                                    const start = fullfileName.slice(
                                      0,
                                      modFolder.length + keepLength
                                    )
                                    const end = fullfileName.slice(
                                      -fileNameWithExt.length - keepLength
                                    )
                                    fileName = `${start}...${end}`
                                  }
                                  return (
                                    <li key={index}>
                                      <p
                                        className="max-w-full my-px overflow-hidden truncate cursor-pointer whitespace-nowrap text-ellipsis m-w-full hover:underline"
                                        onClick={() =>
                                          window.electron.ipcRenderer.send(
                                            IpcKey.OPEN_FOLDER,
                                            fileFolderPath
                                          )
                                        }
                                        title={file}
                                      >
                                        {fileName}
                                      </p>
                                    </li>
                                  )
                                })}
                              </ul>
                            </AccordionContent>
                          </AccordionItem>
                        </Accordion>
                      </li>
                    ))}
                  </ul>
                </code>
              </ScrollArea>
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
                        <span className={'block'}>{t(log.message)}</span>
                      </div>
                    ))}
                  </code>
                </ScrollArea>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            )}
            {conversionStatus === ConversionStatus.FINISHED && (
              <Button onClick={handleCloseModal}>{t('Close')}</Button>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </>
  )
}
