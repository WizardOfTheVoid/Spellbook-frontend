import type { DiagnosticsApi } from '../../../../shared/diagnosticLogs'
import { captureDiagnosticConsole, formatDiagnosticArguments } from '../../../../shared/diagnosticLogFormatting'

export function startRendererLogging(target: Window & Pick<typeof globalThis, `console`>, diagnostics: DiagnosticsApi): () => void {
  const writeError = (label: string, value: unknown) => {
    try {
      diagnostics.write({ level: `error`, message: formatDiagnosticArguments([label, value]) })
    } catch {
      // A closing window may no longer have an IPC connection.
    }
  }
  const onError = (event: ErrorEvent) => writeError(`Uncaught error:`, event.error ?? event.message)
  const onRejection = (event: PromiseRejectionEvent) => writeError(`Unhandled rejection:`, event.reason)
  const restoreConsole = captureDiagnosticConsole(target.console, (level, message) => diagnostics.write({ level, message }))
  target.addEventListener(`error`, onError)
  target.addEventListener(`unhandledrejection`, onRejection)
  diagnostics.write({ level: `info`, message: `Renderer started.` })
  return () => {
    restoreConsole()
    target.removeEventListener(`error`, onError)
    target.removeEventListener(`unhandledrejection`, onRejection)
  }
}
