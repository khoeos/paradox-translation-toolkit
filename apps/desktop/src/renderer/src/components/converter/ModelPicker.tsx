import { Check, ListFilter, LoaderCircle, RefreshCw } from 'lucide-react'
import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { TranslateProvider } from '@ptt/translate/defaults'
import { Button } from '@ptt/ui/components/button'
import { Input } from '@ptt/ui/components/input'
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from '@ptt/ui/components/popover'
import { ScrollArea } from '@ptt/ui/components/scroll-area'
import { cn } from '@ptt/ui/lib/utils'

import { trpc } from '@renderer/lib/trpc'

interface ModelPickerProps {
  id: string
  provider: TranslateProvider
  baseUrl: string
  apiKey: string
  value: string
  placeholder: string
  onChange: (model: string) => void
}

const FILTER_FROM = 8

export function ModelPicker({
  id,
  provider,
  baseUrl,
  apiKey,
  value,
  placeholder,
  onChange
}: ModelPickerProps) {
  const { t } = useTranslation()
  const filterInputId = useId()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const listModels = trpc.translate.listModels.useMutation()

  const detect = (): void => {
    setQuery('')
    listModels.mutate({ provider, baseUrl, ...(apiKey !== '' && { apiKey }) })
  }

  const models = listModels.data?.ok === true ? listModels.data.models : []
  const failure =
    listModels.error?.message ?? (listModels.data?.ok === false ? listModels.data.error : undefined)
  const needle = query.trim().toLowerCase()
  const shown =
    needle === '' ? models : models.filter(model => model.toLowerCase().includes(needle))

  return (
    <div className="flex gap-2">
      <Input
        id={id}
        value={value}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          title={t('translate.detectModels')}
          aria-label={t('translate.detectModels')}
          disabled={baseUrl.trim() === ''}
          onClick={detect}
          render={<Button type="button" variant="outline" size="icon" />}
        >
          {listModels.isPending ? (
            <LoaderCircle aria-hidden="true" className="animate-spin" />
          ) : (
            <RefreshCw aria-hidden="true" />
          )}
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={6}
          className="bg-popover/70! w-[320px] flex-col gap-0 rounded-[10px] border p-0 shadow-2xl backdrop-blur-sm"
        >
          <PopoverTitle className="border-b px-3 py-2 font-semibold tracking-wider">
            {t('translate.modelsTitle')}
          </PopoverTitle>

          {listModels.isPending ? (
            <p className="flex items-center gap-2 px-3 py-4 text-muted-foreground">
              <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
              {t('translate.modelsLoading')}
            </p>
          ) : failure !== undefined ? (
            <p className="px-3 py-4 text-destructive">
              {t('translate.modelsFailed', { message: failure })}
            </p>
          ) : models.length === 0 ? (
            <p className="px-3 py-4 text-muted-foreground">{t('translate.modelsEmpty')}</p>
          ) : (
            <>
              {models.length >= FILTER_FROM ? (
                <div className="relative border-b p-2">
                  <ListFilter
                    aria-hidden="true"
                    className="absolute top-1/2 left-4 size-3.5 -translate-y-1/2 text-muted-foreground"
                  />
                  <Input
                    id={filterInputId}
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={t('translate.modelsFilter')}
                    className="pl-7"
                  />
                </div>
              ) : null}

              <ScrollArea className="max-h-[260px]">
                <div role="listbox" aria-label={t('translate.modelsTitle')} className="p-1">
                  {shown.map(model => (
                    <button
                      key={model}
                      type="button"
                      role="option"
                      aria-selected={model === value}
                      onClick={() => {
                        onChange(model)
                        setOpen(false)
                      }}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-accent',
                        model === value && 'bg-accent/60'
                      )}
                    >
                      <Check
                        aria-hidden="true"
                        className={cn(
                          'size-3.5 shrink-0 text-primary',
                          model === value ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className="truncate">{model}</span>
                    </button>
                  ))}
                  {shown.length === 0 ? (
                    <p className="px-2 py-3 text-muted-foreground">{t('translate.modelsEmpty')}</p>
                  ) : null}
                </div>
              </ScrollArea>
            </>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
