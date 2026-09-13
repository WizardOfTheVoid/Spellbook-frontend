import type { DiagnosticLogLevel } from './diagnosticLogs'

const maxMessageLength = 8_000

export function sanitizeDiagnosticMessage(message: string): string {
  return message.slice(0, maxMessageLength)
    .replace(/(?:https?|spellbook):\/\/[^\s)]+/giu, value => {
      try {
        const url = new URL(value)
        return `${url.protocol}//${url.host}${url.pathname}`
      } catch {
        return `[URL omitted]`
      }
    })
    .replace(/\b(?:authorization|cookie|set-cookie)\s*[:=]\s*[^\r\n]+/giu, `[credentials omitted]`)
    .replace(/\b(?:bearer|basic)\s+[^\s,;]+/giu, `[credentials omitted]`)
    .replace(/\b[\w-]*(?:token|password|passwd|secret|api[_-]?key|ticket)[\w-]*["']?\s*[:=]\s*(?:"[^"]*"|'[^']*'|[^\s,;]+)/giu, `[secret omitted]`)
    .replace(/\b[A-Za-z0-9_+\/-]{32,}(?:\.[A-Za-z0-9_+\/-]+)*={0,2}\b/gu, `[identifier omitted]`)
    .replace(/(?:\{|\[\s*["'{\d])[\s\S]*/gu, `[details omitted]`)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/gu, ``)
}

export function formatDiagnosticArguments(values: unknown[]): string {
  return sanitizeDiagnosticMessage(values.slice(0, 8).map(value => {
    if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`
    if (typeof value === `string`) return value.slice(0, maxMessageLength)
    if (value === null || [`number`, `boolean`, `undefined`, `bigint`].includes(typeof value)) return String(value)
    return `[details omitted]`
  }).join(` `))
}

export function captureDiagnosticConsole(
  target: Pick<Console, `warn` | `error`>,
  write: (level: DiagnosticLogLevel, message: string) => void,
): () => void {
  const original = { warn: target.warn, error: target.error }
  for (const level of [`warn`, `error`] as const) {
    target[level] = (...values: unknown[]) => {
      original[level].apply(target, values)
      try {
        write(level, formatDiagnosticArguments(values))
      } catch {
        // Diagnostics must not interfere with the application or console.
      }
    }
  }
  return () => Object.assign(target, original)
}
