import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type {
  GameTokens,
  LanguageCode,
  TargetListProblem,
  TranslationTarget
} from '@ptt/shared/languages'
import {
  LANGUAGE_DISPLAY_NAMES,
  findNothingToWriteTarget,
  findTargetListProblem,
  getTargetLanguageCode,
  isLanguageLabel,
  normalizeTargetLanguage,
  shadowedLanguageOf
} from '@ptt/shared/languages'
import { Button } from '@ptt/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '@ptt/ui/components/dialog'
import { Input } from '@ptt/ui/components/input'
import { Label } from '@ptt/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@ptt/ui/components/select'

import { describeTargetProblem, languageLabel } from '@renderer/lib/targets'
import { trpc } from '@renderer/lib/trpc'
import { useConverterFormStore } from '@renderer/store/converter-form'

const LANGUAGE_DATALIST_ID = 'custom-target-language-options'

const CANDIDATE_CHECKED_PROBLEMS: ReadonlySet<TargetListProblem['code']> = new Set([
  'empty',
  'invalid-language',
  'invalid-token'
])

function defaultToken(
  sourceLanguage: LanguageCode,
  tokens: GameTokens,
  avoidSourceToken: boolean
): string {
  const sourceToken = tokens[sourceLanguage]
  const declared = Object.values(tokens)
  if (avoidSourceToken) {
    const other = declared.find(token => token !== sourceToken)
    if (other !== undefined) return other
  }
  return sourceToken ?? declared[0] ?? ''
}

export function CustomTargetDialog() {
  const { t } = useTranslation()
  const { data } = trpc.games.list.useQuery()
  const selectedGameId = useConverterFormStore(s => s.selectedGameId)
  const sourceLanguage = useConverterFormStore(s => s.sourceLanguage)
  const targets = useConverterFormStore(s => s.targets)
  const mode = useConverterFormStore(s => s.mode)
  const targetContent = useConverterFormStore(s => s.targetContent)
  const translate = useConverterFormStore(s => s.translate)
  const addCustomTarget = useConverterFormStore(s => s.addCustomTarget)

  const [open, setOpen] = useState(false)
  const [language, setLanguage] = useState('')
  const [token, setToken] = useState('')

  const game = data?.find(g => g.id === selectedGameId)
  if (!game) return null

  const tokens = game.languageFileToken

  const writesNothingUnderSourceToken =
    mode === 'add-to-current' && targetContent === 'missing-keys'

  const handleOpenChange = (next: boolean): void => {
    setOpen(next)
    if (!next) return
    setLanguage('')
    setToken(defaultToken(sourceLanguage, tokens, writesNothingUnderSourceToken))
  }

  const handleLanguageChange = (value: string): void => {
    setLanguage(value)
    const code = getTargetLanguageCode(normalizeTargetLanguage(value))
    const ownToken = code === undefined ? undefined : tokens[code]
    if (ownToken !== undefined) setToken(ownToken)
  }

  const handleTokenChange = (value: string | null): void => {
    if (value !== null) setToken(value)
  }

  const trimmedLanguage = language.trim()
  const normalizedLanguage = normalizeTargetLanguage(language)
  const recognizedCode = getTargetLanguageCode(normalizedLanguage)
  const candidate: TranslationTarget = { language: normalizedLanguage, fileToken: token }
  const shadows = shadowedLanguageOf(candidate, tokens)

  let error: string | undefined
  if (trimmedLanguage.length === 0) {
    error = t('converter.customTarget.emptyLanguage')
  } else if (!isLanguageLabel(normalizedLanguage)) {
    error = t('converter.customTarget.invalidLanguage')
  } else if (normalizedLanguage === sourceLanguage) {
    error = t('converter.customTarget.sameLanguage')
  } else if (token.length === 0) {
    error = t('converter.customTarget.invalidToken')
  } else {
    const withoutLanguage = targets.filter(
      existing => normalizeTargetLanguage(existing.language) !== normalizedLanguage
    )
    const problem = findTargetListProblem([...withoutLanguage, candidate], tokens)
    if (problem !== undefined && !CANDIDATE_CHECKED_PROBLEMS.has(problem.code)) {
      error = describeTargetProblem(t, problem, game.displayName)
    }

    if (
      error === undefined &&
      findNothingToWriteTarget([candidate], tokens, sourceLanguage, mode, targetContent) !==
        undefined
    ) {
      error = t('converter.customTarget.nothingToWrite', { token })
    }
  }

  const rapidapiWarning =
    error === undefined &&
    translate.enabled &&
    translate.provider === 'rapidapi' &&
    recognizedCode === undefined
      ? t('converter.customTarget.rapidapiUnsupported', { language: normalizedLanguage })
      : undefined

  const canAdd = error === undefined

  const handleAdd = (): void => {
    if (!canAdd) return
    addCustomTarget({ language: normalizedLanguage, fileToken: token })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button type="button" variant="outline" size="sm" />}>
        {t('converter.customTarget.add')}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('converter.customTarget.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="custom-target-language">{t('converter.customTarget.language')}</Label>
            <Input
              id="custom-target-language"
              list={LANGUAGE_DATALIST_ID}
              value={language}
              onChange={event => handleLanguageChange(event.target.value)}
            />
            <datalist id={LANGUAGE_DATALIST_ID}>
              {Object.values(LANGUAGE_DISPLAY_NAMES).map(name => (
                <option key={name} value={name} />
              ))}
            </datalist>
            <p className="text-xs text-muted-foreground">
              {t('converter.customTarget.languageHint')}
            </p>
          </div>

          <div className="space-y-1">
            <Label htmlFor="custom-target-token">{t('converter.customTarget.fileToken')}</Label>
            <Select value={token} onValueChange={handleTokenChange}>
              <SelectTrigger id="custom-target-token" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(tokens).map(([code, fileToken]) => (
                  <SelectItem key={fileToken} value={fileToken}>
                    {t('converter.customTarget.tokenOption', {
                      token: fileToken,
                      owner: languageLabel(t, code)
                    })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('converter.customTarget.tokenHintGame', { game: game.displayName })}
            </p>
          </div>

          {error ? (
            <p className="text-xs text-destructive">{error}</p>
          ) : (
            <div className="space-y-1">
              {trimmedLanguage.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {recognizedCode !== undefined
                    ? t('converter.customTarget.recognized', {
                        language: languageLabel(t, recognizedCode)
                      })
                    : t('converter.customTarget.unrecognizedHint', {
                        language: normalizedLanguage
                      })}
                </p>
              ) : null}
              {shadows !== undefined ? (
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  {t('converter.customTarget.shadows', { owner: languageLabel(t, shadows) })}
                </p>
              ) : null}
              {rapidapiWarning ? (
                <p className="text-xs text-amber-600 dark:text-amber-500">{rapidapiWarning}</p>
              ) : null}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button type="button" onClick={handleAdd} disabled={!canAdd}>
            {t('converter.customTarget.add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
