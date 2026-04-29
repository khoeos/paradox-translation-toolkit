import { useEffect } from 'react'

import { trpc } from '@renderer/lib/trpc'
import { isUpdaterEvent, useUpdaterStore } from '@renderer/store/updater'

export function useUpdaterEventsSubscription(): void {
  const applyEvent = useUpdaterStore(s => s.applyEvent)
  const hydrate = useUpdaterStore(s => s.hydrateFromState)
  const stateQuery = trpc.updater.getState.useQuery(undefined, { staleTime: Infinity })

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
