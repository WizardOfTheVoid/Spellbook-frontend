export type DiagnosticLogLevel = `info` | `warn` | `error`

export type DiagnosticLogEntry = {
  level: DiagnosticLogLevel
  message: string
}

export type LogExportResult = { status: `saved` | `cancelled` | `error` }

export type DiagnosticsApi = {
  write: (entry: DiagnosticLogEntry) => void
  exportLogs: () => Promise<LogExportResult>
}
