import { useTranslation } from 'react-i18next'

import type { GameSummary } from '@ptt/shared'

import { targetListError, targetListWarning } from '@renderer/lib/targets'
import { trpc } from '@renderer/lib/trpc'
import { useConverterFormStore } from '@renderer/store/converter-form'

export interface TargetValidation {
  game: GameSummary | undefined
  tokens: GameSummary['languageFileToken']
  error: string | undefined
  warning: string | undefined
}

export function useTargetValidation(): TargetValidation {
  const { t } = useTranslation()
  const { data } = trpc.games.list.useQuery()
  const selectedGameId = useConverterFormStore(s => s.selectedGameId)
  const targets = useConverterFormStore(s => s.targets)
  const sourceLanguage = useConverterFormStore(s => s.sourceLanguage)
  const mode = useConverterFormStore(s => s.mode)
  const targetContent = useConverterFormStore(s => s.targetContent)
  const translate = useConverterFormStore(s => s.translate)

  const game = data?.find(g => g.id === selectedGameId)
  const tokens = game?.languageFileToken ?? {}
  const context = {
    targets,
    tokens,
    mode,
    targetContent,
    sourceLanguage,
    provider: translate.provider,
    translateEnabled: translate.enabled,
    ...(game && { gameName: game.displayName })
  }

  return {
    game,
    tokens,
    error: targetListError(t, context),
    warning: targetListWarning(t, context)
  }
}
