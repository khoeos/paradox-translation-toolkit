/** Set by the Playwright fixture: suppresses dev-only and network side effects. */
export const isE2E = process.env['PTT_E2E'] === '1'

/** Set by electron-vite when started with `--remoteDebuggingPort` (see `dev:debug`). */
export const isRemoteDebugging = process.env['REMOTE_DEBUGGING_PORT'] !== undefined
