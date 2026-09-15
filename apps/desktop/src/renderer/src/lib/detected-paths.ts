import type { AppRouter } from '@main/ipc/trpc-router'
import type { inferRouterOutputs } from '@trpc/server'

import { formatPathParts, TRUNCATION_ELLIPSIS } from '@renderer/lib/format-path'
import type { KnownPathKind } from '@renderer/lib/known-paths'

type RouterOutputs = inferRouterOutputs<AppRouter>

const EMPTY_SUBTITLE_PLACEHOLDER = '-'

export type DetectedPaths = RouterOutputs['gameLocator']['locate']

export const DETECTED_PATH_KINDS = [
  'workshopContent',
  'userModsFolder',
  'installDir',
  'gogInstall'
] as const

export type DetectedPathKind = (typeof DETECTED_PATH_KINDS)[number]

export interface DetectedPathSuggestion {
  kind: DetectedPathKind
  path: string
}

const isMeaningfulPath = (path: string | undefined): path is string =>
  path !== undefined && path.trim().length > 0

export const buildDetectedSuggestions = (
  paths: DetectedPaths,
  kind: KnownPathKind
): DetectedPathSuggestion[] => {
  const suggestions: DetectedPathSuggestion[] = []
  const seenPaths = new Set<string>()

  const pushSuggestion = (suggestionKind: DetectedPathKind, path: string): void => {
    if (seenPaths.has(path)) return
    seenPaths.add(path)
    suggestions.push({ kind: suggestionKind, path })
  }

  if (kind === 'modFolder') {
    for (const path of paths.workshopContentPaths) {
      if (isMeaningfulPath(path)) pushSuggestion('workshopContent', path)
    }
    if (isMeaningfulPath(paths.userModsFolder)) {
      pushSuggestion('userModsFolder', paths.userModsFolder)
    }
  } else {
    if (isMeaningfulPath(paths.installDir)) {
      pushSuggestion('installDir', paths.installDir)
    }
    if (isMeaningfulPath(paths.gogInstall)) {
      pushSuggestion('gogInstall', paths.gogInstall)
    }
  }
  return suggestions
}

export interface PathDisplay {
  title: string
  subtitle: string
}

export const toPathDisplay = (path: string): PathDisplay => {
  const { head, tail, truncated } = formatPathParts(path)
  if (!truncated) return { title: tail, subtitle: EMPTY_SUBTITLE_PLACEHOLDER }

  return {
    title: tail,
    subtitle: `${head}/${TRUNCATION_ELLIPSIS}`
  }
}
