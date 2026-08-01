import { parentPort } from 'worker_threads'
import run, { cancellation, Request } from './translateFn'
import { ConversionStatus, ConversionStatusType, WorkerAction } from '../global/types'

const port = parentPort
if (!port) throw new Error('IllegalState')

port.on('message', (message: Request | { cancel: true }) => {
  // Cancelling is cooperative: killing the thread could leave a half written file behind
  if ('cancel' in message) {
    cancellation.requested = true
    return
  }

  run(message, port)
    .then((output) => {
      port.postMessage({
        type: ConversionStatusType.STATUS,
        status:
          message.action === WorkerAction.SCAN
            ? ConversionStatus.SCAN_FINISHED
            : ConversionStatus.FINISHED,
        output
      })
    })
    .catch((error: Error) => {
      // A failure here is global (unreadable root folder, ...), a broken mod is
      // already reported inside its own result
      port.postMessage({
        type: ConversionStatusType.STATUS,
        status: ConversionStatus.ERROR,
        error: error.message
      })
    })
    .finally(() => {
      setTimeout(() => {
        port.close()
      }, 10000)
    })
})
