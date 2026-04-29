import { createRoute } from '@tanstack/react-router'

import { rootRoute } from './__root'

// Lazy route to keep the initial shell small.
export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings'
}).lazy(() => import('./settings.lazy').then(m => m.Route))
