// `electron-log` has no `exports` field, so under Node ESM the sub-path needs
// the explicit `.js` extension. Without it, `npm run build` works but the
// packaged app fails with ERR_MODULE_NOT_FOUND at boot.
import log from 'electron-log/main.js'

/** Configures the persistent rotated file logger. Files land in `app.getPath('logs')`. */
export function initializeLogger(): void {
  log.initialize()

  // ~10 MB per file, 5 archives kept. Older archives are deleted on rotation.
  log.transports.file.maxSize = 10 * 1024 * 1024
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] [{processType}] {text}'

  // Sensible default; can be lowered via the LOG_LEVEL env var for support.
  const envLevel = process.env['LOG_LEVEL']
  if (envLevel === 'debug' || envLevel === 'info' || envLevel === 'warn' || envLevel === 'error') {
    log.transports.file.level = envLevel
    log.transports.console.level = envLevel
  } else {
    log.transports.file.level = 'info'
    log.transports.console.level = 'info'
  }
}

export { log }
