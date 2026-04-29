import { createHashHistory, createRouter } from '@tanstack/react-router'

import { rootRoute } from './routes/__root'
import { indexRoute } from './routes/index'
import { settingsRoute } from './routes/settings'

const routeTree = rootRoute.addChildren([indexRoute, settingsRoute])

export const router = createRouter({
  routeTree,
  history: createHashHistory(),
  defaultPreload: 'intent'
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
