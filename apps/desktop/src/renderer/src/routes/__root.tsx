import { createRootRoute, Outlet } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'

import { Header } from '@renderer/components/Header'
import { UpdateBanner } from '@renderer/components/UpdateBanner'
import { useJobEventsSubscription } from '@renderer/hooks/useJobEventsSubscription'
import { useSettingsSync } from '@renderer/hooks/useSettingsSync'
import { useUiLanguageSync } from '@renderer/hooks/useUiLanguageSync'
import { useUpdaterEventsSubscription } from '@renderer/hooks/useUpdaterEventsSubscription'

// Lazy-loaded so a static import doesn't drag devtools into the prod bundle.
const DevTools = import.meta.env.DEV
  ? lazy(() =>
      Promise.all([
        import('@tanstack/react-router-devtools'),
        import('@tanstack/react-query-devtools')
      ]).then(([routerMod, queryMod]) => ({
        default: function DevToolsImpl() {
          const RouterDevtools = routerMod.TanStackRouterDevtools
          const QueryDevtools = queryMod.ReactQueryDevtools
          return (
            <>
              <RouterDevtools position="bottom-right" />
              <QueryDevtools buttonPosition="bottom-left" />
            </>
          )
        }
      }))
    )
  : null

function RootLayout() {
  useJobEventsSubscription()
  useSettingsSync()
  useUpdaterEventsSubscription()
  useUiLanguageSync()
  return (
    <>
      <Header />
      <UpdateBanner />
      <main className="pt-20 pb-8 px-6">
        <Outlet />
      </main>
      {DevTools ? (
        <Suspense fallback={null}>
          <DevTools />
        </Suspense>
      ) : null}
    </>
  )
}

export const rootRoute = createRootRoute({ component: RootLayout })
