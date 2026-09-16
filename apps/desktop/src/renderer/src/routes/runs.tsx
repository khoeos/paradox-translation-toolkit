import { createRoute } from '@tanstack/react-router'

import { rootRoute } from './__root'

export const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/runs'
}).lazy(() => import('./runs.lazy').then(m => m.Route))
