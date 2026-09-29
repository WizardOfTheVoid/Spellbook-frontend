import assert from 'node:assert/strict'
import test from 'node:test'
import type { DiagnosticLogEntry } from '../../../../shared/diagnosticLogs'
import { startRendererLogging } from './rendererLogging'

test(`renderer captures console, uncaught errors and rejected promises, then cleans up`, () => {
  const target = Object.assign(new EventTarget(), { console: { warn: (..._values: unknown[]) => {}, error: (..._values: unknown[]) => {} } })
  const entries: DiagnosticLogEntry[] = []
  const stop = startRendererLogging(target as unknown as Parameters<typeof startRendererLogging>[0], {
    write: entry => entries.push(entry),
    exportLogs: async () => ({ status: `cancelled` }),
  })
  target.console.warn(`Connection unavailable`)
  target.dispatchEvent(Object.assign(new Event(`error`), { error: new Error(`Cannot render`) }))
  target.dispatchEvent(Object.assign(new Event(`unhandledrejection`), { reason: new Error(`Request failed`) }))
  assert.deepEqual(entries.map(entry => entry.level), [`info`, `warn`, `error`, `error`])
  assert.match(entries[2]!.message, /Cannot render/u)
  assert.match(entries[3]!.message, /Request failed/u)
  stop()
  target.dispatchEvent(Object.assign(new Event(`error`), { message: `After cleanup` }))
  target.console.error(`After cleanup`)
  assert.equal(entries.length, 4)
})
