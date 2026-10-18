import { startRendererLogging } from './rendererLogging'
import { notificationEvents } from '../notifications/notificationEvents'
import { sanitizeDiagnosticMessage } from '../../../../shared/diagnosticLogFormatting'

if (typeof window !== `undefined` && window.chivDiagnostics) {
  const stop = startRendererLogging(window, window.chivDiagnostics)
  const stopNotifications = notificationEvents.listen(({ level, message }) => {
    if (level === `error` || level === `warning`) {
      try {
        window.chivDiagnostics.write({ level: level === `error` ? `error` : `warn`, message: sanitizeDiagnosticMessage(message) })
      } catch {
        // Keep notifications working while the window is closing.
      }
    }
  })
  import.meta.hot?.dispose(() => {
    stop()
    stopNotifications()
  })
}
