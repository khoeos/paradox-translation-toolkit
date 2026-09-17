# apps/desktop

Electron app : `main` (Node, Electron, real FS) + `preload` + `renderer` (React).
The repo-wide rules live in the root `CLAUDE.md` ; this file covers what is
specific to this app.

## Boundaries and file placement

- The only allowed renderer/main crossing is
  `import type { AppRouter } from '@main/ipc/trpc-router'` ; everything else goes
  over tRPC. A value import compiles and bundles with no warning, so keep
  `@ptt/shared` and `@ptt/converter` as `import type` in the renderer or
  zod and the whole pipeline land in the renderer bundle.
- The `scanMods` / `runConvert` pipeline may only be called from
  `main/workers/converter.worker.ts`, a UtilityProcess with its own
  `rollupOptions.input` entry in `electron.vite.config.ts` (a second worker without
  that entry is never built). `main/services/*` import converter types only :
  calling `scanMods()` from `converter-service.ts` compiles and puts multi-second work
  back on the main thread. `main/services/node-fs.ts` is the only production `FsLike`.
- New tRPC procedure : file under `main/ipc/procedures/<domain>.ts`, router
  registered in `main/ipc/trpc-router.ts`, `.input()` zod schema inline in that same
  file (procedure schemas do not belong in `@ptt/shared`), body a one-line
  delegation to a `ctx.*` service (12 of 15 are exactly that). If the work can
  outlive 120 s, add the path to `LONG_RUNNING_PATHS` in `renderer/src/lib/ipc-link.ts`
  and report completion through job events. zod stays main-process only.
- Routes are code-based : a new `renderer/src/routes/*.tsx` is dead code until it is
  added to `rootRoute.addChildren([...])` in `renderer/src/router.tsx`. There is no
  `routeTree.gen.ts` ; `@tanstack/router-plugin` is an unused devDependency.
- Components under `renderer/src/components` may call tRPC and Zustand directly
  (11 of 12 do), and so do the route files : do not refactor them into presentational
  components. Hooks are one exported hook per file under `renderer/src/hooks/`, and
  app-wide subscriptions are mounted only in `routes/__root.tsx`.

## Tests

- Vitest (`src/**/*.test.ts`, `environment: 'node'`) and Playwright (`e2e/**/*.test.ts`) never
  overlap: both configs pin their own `include` / `testDir`. `pnpm test` is Vitest only, `pnpm e2e`
  is Playwright only, and CI runs the first one.
- The E2E fixture launches the **built** app (`out/main/index.js`), so `pnpm e2e` goes through turbo
  to rebuild first. Running `playwright test` directly tests whatever is in `out/`.
- `main/env.ts` is the one place that reads automation env vars (`PTT_E2E`,
  `REMOTE_DEBUGGING_PORT`). Both currently gate the detached DevTools window; `PTT_E2E` also gates
  the startup update check. Do not scatter `process.env` reads for this.
- Adding a game means updating `GAME_TABS_IN_REGISTRY_ORDER` in `e2e/app.test.ts`: it is what pins
  the `builtInGames` order = tab order invariant to the actual UI.
