import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { useTRPC } from '@renderer/lib/trpc'
import { isUpdaterEvent, useUpdaterStore } from '@renderer/store/updater'

export function useUpdaterEventsSubscription(): void {
  const trpc = useTRPC()
  const applyEvent = useUpdaterStore(s => s.applyEvent)
  const hydrate = useUpdaterStore(s => s.hydrateFromState)
  const stateQuery = useQuery(
    trpc.updater.getState.queryOptions(undefined, { staleTime: Infinity })
  )

  // Hydrate once with the current main-process state (covers events fired
  // before the renderer subscribed).
  useEffect(() => {
    if (!stateQuery.data) return
    hydrate({
      status: stateQuery.data.status,
      latestVersion: stateQuery.data.latestVersion,
      downloadProgress: stateQuery.data.downloadProgress,
      errorMessage: stateQuery.data.errorMessage,
      releaseNotes: stateQuery.data.releaseNotes,
      autoUpdateSupported: stateQuery.data.autoUpdateSupported,
      releaseUrl: stateQuery.data.releaseUrl
    })
  }, [stateQuery.data, hydrate])

  useEffect(() => {
    const off = window.api.onUpdaterEvent(payload => {
      if (isUpdaterEvent(payload)) applyEvent(payload)
    })
    return off
  }, [applyEvent])
}
