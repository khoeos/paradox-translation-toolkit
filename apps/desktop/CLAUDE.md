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
- The `scan` / `diff` / `plan` / `apply` pipeline may only be called from
  `main/workers/converter.worker.ts`, a UtilityProcess with its own
  `rollupOptions.input` entry in `electron.vite.config.ts` (a second worker without
  that entry is never built). `main/services/*` import converter types only :
  calling `scan()` from `converter-service.ts` compiles and puts multi-second work
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
