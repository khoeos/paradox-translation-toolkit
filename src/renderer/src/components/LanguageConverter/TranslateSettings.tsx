import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { IpcKey, TranslateProvider } from '@global/types'
import { Card, CardContent } from '@renderer/components/ui/Card'
import { Button } from '@renderer/components/ui/Button'
import { FolderInput, Input } from '@renderer/components/ui/Input'
import { Switch } from '@renderer/components/ui/Switch'
import { Popover, PopoverContent, PopoverTrigger } from '@renderer/components/ui/Popover'
import { HelpCircleIcon } from 'lucide-react'
import useOptionsStore from '@renderer/store/options'
import { cn } from '@renderer/lib/utils'

interface TestResult {
  ok: boolean
  sample?: string
  error?: string
}

export default function TranslateSettings(): JSX.Element {
  const { t } = useTranslation()
  const { translate, setTranslate, setTranslateProvider } = useOptionsStore()
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<TestResult | null>(null)

  useEffect(() => {
    window.api.on(IpcKey.TEST_PROVIDER_RESULT, (data) => {
      setTesting(false)
      setResult(data as TestResult)
    })
    window.api.on(IpcKey.SELECT_GAME_RESULT, (data) => setTranslate({ gamePath: data as string }))
  }, [])

  const runTest = (): void => {
    setResult(null)
    setTesting(true)
    window.electron.ipcRenderer.send(IpcKey.TEST_PROVIDER, translate)
  }

  const isOllama = translate.provider === TranslateProvider.OLLAMA
  const isRapid = translate.provider === TranslateProvider.RAPIDAPI
  // A hosted translator has no model to choose and cannot be given a glossary prompt
  const needsModel = !isRapid

  return (
    <Card className={'col-span-12'}>
      <CardContent>
        <div className={'flex items-center gap-2 mt-2'}>
          <h2 className={'text-xl font-semibold tracking-wide'}>{t('Translate')}</h2>
          <Popover>
            <PopoverTrigger>
              <HelpCircleIcon className={'text-gray-300/80 mt-1'} />
            </PopoverTrigger>
            <PopoverContent className={'text-sm w-[50vw]'}>
              <p className={'mb-2'}>{t('TranslateDesc')}</p>
              <p className={'font-semibold tracking-wide text-red-200'}>{t('TranslateWarn')}</p>
            </PopoverContent>
          </Popover>
          <Switch
            checked={translate.enabled}
            onCheckedChange={(enabled) => setTranslate({ enabled })}
          />
          <span className={'text-sm text-gray-300'}>
            {translate.enabled ? t('TranslateOn') : t('TranslateOff')}
          </span>
        </div>

        {translate.enabled && (
          <div className={'mt-3 space-y-3'}>
            <div className={'grid grid-cols-3 gap-2'}>
              <Button
                className={cn(
                  'bg-gray-900 font-semibold tracking-wide text-white hover:text-gray-800',
                  isOllama && 'bg-amber-600'
                )}
                onClick={() => setTranslateProvider(TranslateProvider.OLLAMA)}
              >
                {t('ProviderOllama')}
              </Button>
              <Button
                className={cn(
                  'bg-gray-900 font-semibold tracking-wide text-white hover:text-gray-800',
                  translate.provider === TranslateProvider.OPENAI && 'bg-amber-600'
                )}
                onClick={() => setTranslateProvider(TranslateProvider.OPENAI)}
              >
                {t('ProviderOpenAi')}
              </Button>
              <Button
                className={cn(
                  'bg-gray-900 font-semibold tracking-wide text-white hover:text-gray-800',
                  isRapid && 'bg-amber-600'
                )}
                onClick={() => setTranslateProvider(TranslateProvider.RAPIDAPI)}
              >
                {t('ProviderRapidApi')}
              </Button>
            </div>

            <div className={'grid grid-cols-12 gap-2'}>
              <div className={'col-span-6'}>
                <label className={'block mb-1 text-xs text-gray-300/80'}>{t('BaseUrl')}</label>
                <Input
                  value={translate.baseUrl}
                  onChange={(e) => setTranslate({ baseUrl: e.target.value })}
                  placeholder={'http://localhost:11434'}
                  className={'h-9'}
                />
              </div>
              {needsModel && (
                <div className={'col-span-6'}>
                  <label className={'block mb-1 text-xs text-gray-300/80'}>{t('Model')}</label>
                  <Input
                    value={translate.model}
                    onChange={(e) => setTranslate({ model: e.target.value })}
                    placeholder={isOllama ? 'qwen3.6:latest' : 'llama-3.3-70b-versatile'}
                    className={cn('h-9', translate.model.trim() === '' && 'border-red-500/60')}
                  />
                </div>
              )}
              {!isOllama && (
                <div className={'col-span-6'}>
                  <label className={'block mb-1 text-xs text-gray-300/80'}>{t('ApiKey')}</label>
                  <Input
                    type={'password'}
                    value={translate.apiKey ?? ''}
                    onChange={(e) => setTranslate({ apiKey: e.target.value })}
                    placeholder={'sk-...'}
                    className={'h-9'}
                  />
                </div>
              )}
              <div className={'col-span-3'}>
                <label className={'block mb-1 text-xs text-gray-300/80'}>{t('BatchSize')}</label>
                <Input
                  type={'number'}
                  min={1}
                  max={200}
                  value={translate.batchSize}
                  onChange={(e) => setTranslate({ batchSize: Number(e.target.value) || 1 })}
                  className={'h-9'}
                />
              </div>
              <div className={'col-span-3'}>
                <label className={'block mb-1 text-xs text-gray-300/80'}>{t('Concurrency')}</label>
                <Input
                  type={'number'}
                  min={1}
                  max={16}
                  value={translate.concurrency}
                  onChange={(e) => setTranslate({ concurrency: Number(e.target.value) || 1 })}
                  className={'h-9'}
                />
              </div>
            </div>

            <div>
              <label className={'block mb-1 text-xs text-gray-300/80'}>{t('GamePath')}</label>
              <FolderInput
                ipc={IpcKey.SELECT_GAME_START}
                value={translate.gamePath ?? ''}
                onChange={(e) => setTranslate({ gamePath: e.target.value })}
                placeholder={'D:\\SteamLibrary\\steamapps\\common\\Crusader Kings III'}
                className={'h-9'}
              />
              <p className={'mt-1 text-xs text-gray-300/80'}>{t('GamePathHint')}</p>
            </div>

            <div className={'flex items-center gap-3'}>
              <Button
                className={'bg-gray-900 text-white hover:text-gray-800 h-9'}
                onClick={runTest}
                disabled={testing || (needsModel && translate.model.trim() === '')}
              >
                {testing ? t('Testing') : t('TestProvider')}
              </Button>
              {result?.ok && (
                <span className={'text-sm text-emerald-400 truncate'}>
                  {t('TestOk', { sample: result.sample })}
                </span>
              )}
              {result && !result.ok && (
                <span className={'text-sm text-red-400 truncate'} title={result.error}>
                  {result.error}
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
