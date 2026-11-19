import { useQuery } from '@tanstack/react-query'

import { buildDetectedSuggestions, type DetectedPathSuggestion } from '@renderer/lib/detected-paths'
import type { KnownPathKind } from '@renderer/lib/known-paths'
import { useTRPC } from '@renderer/lib/trpc'

const EMPTY_SUGGESTIONS: DetectedPathSuggestion[] = []
const EMPTY_STEAM_LIBRARIES: readonly string[] = []

export interface DetectedPathsResult {
  suggestions: DetectedPathSuggestion[]
  steamLibraries: readonly string[]
  isLoading: boolean
  isError: boolean
}

export function useDetectedPaths(gameId: string, kind: KnownPathKind): DetectedPathsResult {
  const trpc = useTRPC()
  const { data, isLoading, isError } = useQuery(trpc.gameLocator.locate.queryOptions({ gameId }))

  return {
    suggestions: data ? buildDetectedSuggestions(data, kind) : EMPTY_SUGGESTIONS,
    steamLibraries: data?.steamLibraries ?? EMPTY_STEAM_LIBRARIES,
    isLoading,
    isError
  }
}
