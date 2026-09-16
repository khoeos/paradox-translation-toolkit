import { createRoute } from '@tanstack/react-router'

import { rootRoute } from './__root'

export const runDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/runs/$file'
}).lazy(() => import('./run-detail.lazy').then(m => m.Route))
