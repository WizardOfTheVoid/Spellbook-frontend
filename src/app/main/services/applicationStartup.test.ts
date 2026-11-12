import assert from 'node:assert/strict'
import test from 'node:test'
import { setImmediate as flushTasks } from 'node:timers/promises'
import { CoreHttpClient } from '../api/core-http-client'
import { ConsoleSetupService } from '../consoleSetup/consoleSetupService'
import type { CoreConnection } from '../core/coreConnection'
import { startApplication } from './applicationStartup'

function createStartupOptions(calls: string[], overrides: {
  isPackaged?: boolean
  startCore?: () => Promise<CoreConnection>
  initializeRuntime?: () => Promise<void>
  reportFatalError?: (message: string, error: unknown) => void
} = {}) {
  return {
    isPackaged: overrides.isPackaged ?? true,
    startCore: overrides.startCore ?? (async () => {
      calls.push(`core:start`)
      return { baseUrl: `http://127.0.0.1:49200`, authToken: `secret-a` }
    }),
    setCoreConnection: (_connection: CoreConnection) => calls.push(`http:set-core`),
    initializeRuntime: overrides.initializeRuntime ?? (async () => {
      await flushTasks()
      calls.push(`runtime:initialize`)
    }),
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
    `runtime:initialize`,
    `ipc:register`,
    `window:create`,
    `monitor:start`,
    `tray:start`
  ])
})

test(`development startup retains its configured Core connection`, async () => {
  const calls: string[] = []

  await startApplication(createStartupOptions(calls, { isPackaged: false }))

  assert.deepEqual(calls, [`runtime:initialize`, `ipc:register`, `window:create`, `monitor:start`, `tray:start`])
})

for (const isPackaged of [true, false]) {
  test(`${isPackaged ? `packaged` : `development`} console setup loads through its active Core connection before IPC`, async context => {
    const requests: Array<{ url: string, token: string | null }> = []
    context.mock.method(globalThis, `fetch`, async (request: Request) => {
      requests.push({ url: request.url, token: request.headers.get(`X-Chiv-Admin-Token`) })
      return Response.json({ ok: true, data: {
        capabilityVersion: 1,
        installed: [{ id: `00000409`, displayName: `US` }],
        restorationFault: null
      } })
    })
    const client = new CoreHttpClient(`http://127.0.0.1:48125`, `development-token`)
    const consoleSetup = new ConsoleSetupService({ callCore: (path, init) => client.call(path, init) },
      () => `NumpadSubtract`, { run: async () => { throw new Error(`Startup must not send game input`) } })
    const calls: string[] = []

    await startApplication({
      ...createStartupOptions(calls, { isPackaged }),
      setCoreConnection: connection => client.setConnection(connection.baseUrl, connection.authToken),
      initializeRuntime: async () => {
        await flushTasks()
        await consoleSetup.loadVerification()
      },
      registerIpc: () => {
        assert.equal(consoleSetup.getState().setupLoaded, true)
        assert.equal(consoleSetup.getState().layoutCatalogStatus, `ready`)
      }
    })

    assert.deepEqual(requests, [{
      url: `http://127.0.0.1:${isPackaged ? 49200 : 48125}/v3/keyboard-layouts`,
      token: isPackaged ? `secret-a` : `development-token`
    }])
  })
}

test(`runtime initialization failure prevents dependent work and reports one fatal error`, async () => {
  const calls: string[] = []
  const errors: unknown[] = []
  const failure = new Error(`Settings could not load`)

  await assert.rejects(startApplication(createStartupOptions(calls, {
    initializeRuntime: async () => {
      calls.push(`runtime:initialize`)
      await flushTasks()
      throw failure
    },
    reportFatalError: (_message, error) => errors.push(error)
  })), failure)

  assert.deepEqual(calls, [`core:start`, `http:set-core`, `runtime:initialize`])
  assert.deepEqual(errors, [failure])
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
