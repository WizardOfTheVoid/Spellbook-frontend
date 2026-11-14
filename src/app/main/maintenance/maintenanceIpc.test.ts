import assert from 'node:assert/strict'
import test from 'node:test'
import { MaintenanceIpc, readMaintenanceStatus } from './maintenanceIpc'
import { MaintenanceMonitor } from './maintenanceMonitor'

const state = { enabled: true, title: `Maintenance`, text: `One\nTwo`, revision: 3 }
const result = (data: unknown) => ({ ok: true, status: 200, statusText: `OK`, data: { ok: true, data } })

test(`public status rejects malformed data and keeps outage distinct from maintenance`, async () => {
  const http = { getServer: async () => result({ maintenance: state, databaseReady: false }) }
  assert.deepEqual(await readMaintenanceStatus(http, new AbortController().signal), { maintenance: state, databaseReady: false })
  await assert.rejects(readMaintenanceStatus({ getServer: async () => result({ maintenance: {}, databaseReady: true }) }, new AbortController().signal), /Invalid/u)
})

test(`admin update IPC requires the main frame and only publishes successful saves`, async () => {
  const handlers = new Map<string, Function>()
  const sender = { mainFrame: {} }
  const valid = { sender, senderFrame: sender.mainFrame }
  let conflict = false
  const adminState = { ...state, updatedAt: `2026-10-21T18:00:00.000Z`, updatedBy: 12 }
  const monitor = new MaintenanceMonitor({ read: async () => ({ maintenance: null, databaseReady: false }) })
  new MaintenanceIpc({ handle: (name: string, handler: Function) => { handlers.set(name, handler) } } as never, monitor,
    { getServer: async () => result(state), patchServer: async () => conflict
      ? { ok: false, status: 409, statusText: `Conflict`, data: null, error: { code: `MAINTENANCE_CONFLICT`, message: `Reload` } }
      : result(adminState) },
    { getCurrent: () => ({ webContents: sender }), sendToCurrent: () => undefined } as never).register()
  const update = handlers.get(`maintenance:update`)!
  await assert.rejects(update({ sender: {}, senderFrame: {} }, {}), /main SpellBook/u)
  assert.equal((await update(valid, {})).ok, true)
  assert.deepEqual(monitor.snapshot().maintenance, state)
  conflict = true
  assert.equal((await update(valid, {})).error.code, `MAINTENANCE_CONFLICT`)
  assert.deepEqual(monitor.snapshot().maintenance, state)
})
