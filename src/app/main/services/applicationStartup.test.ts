import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoreConnection } from '../core/coreConnection'
import { startApplication } from './applicationStartup'

function createStartupOptions(calls: string[], overrides: {
  isPackaged?: boolean
  startCore?: () => Promise<CoreConnection>
  reportFatalError?: (message: string, error: unknown) => void
} = {}) {
  return {
    isPackaged: overrides.isPackaged ?? true,
    startCore: overrides.startCore ?? (async () => {
      calls.push(`core:start`)
      return { baseUrl: `http://127.0.0.1:49200`, authToken: `secret-a` }
    }),
    setCoreConnection: (_connection: CoreConnection) => calls.push(`http:set-core`),
    registerIpc: () => calls.push(`ipc:register`),
    createWindow: () => calls.push(`window:create`),
    startMonitor: () => calls.push(`monitor:start`),
    startTray: () => calls.push(`tray:start`),
    reportFatalError: overrides.reportFatalError ?? (() => undefined)
  }
}

test(`connects packaged Core before IPC, windows, monitors, or workers start`, async () => {
  const calls: string[] = []

  await startApplication(createStartupOptions(calls))

  assert.deepEqual(calls, [
    `core:start`,
    `http:set-core`,
    `ipc:register`,
    `window:create`,
    `monitor:start`,
    `tray:start`
  ])
})

test(`development startup retains its configured Core connection`, async () => {
  const calls: string[] = []

  await startApplication(createStartupOptions(calls, { isPackaged: false }))

  assert.deepEqual(calls, [`ipc:register`, `window:create`, `monitor:start`, `tray:start`])
})

test(`Core startup failure prevents dependent work and reports one fatal error`, async () => {
  const calls: string[] = []
  const errors: Array<{ message: string, error: unknown }> = []
  const failure = new Error(`Core failed`)

  await assert.rejects(
    startApplication(createStartupOptions(calls, {
      startCore: async () => {
        calls.push(`core:start`)
        throw failure
      },
      reportFatalError: (message, error) => errors.push({ message, error })
    })),
    failure
  )

  assert.deepEqual(calls, [`core:start`])
  assert.equal(errors.length, 1)
  assert.match(errors[0]!.message, /local Core service/u)
  assert.equal(errors[0]!.error, failure)
})