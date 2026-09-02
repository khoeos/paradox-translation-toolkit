import log from 'electron-log/main.js'

export function initializeLogger(): void {
  log.initialize()

  log.transports.file.maxSize = 10 * 1024 * 1024
  log.transports.file.format = '[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] [{processType}] {text}'

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
