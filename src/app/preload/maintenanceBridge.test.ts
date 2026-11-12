import assert from 'node:assert/strict'
import test from 'node:test'
import { createMaintenanceBridge } from './maintenanceBridge'

test(`maintenance IPC preserves errors, updates, events and unsubscribe`, async () => {
  const calls: unknown[][] = []
  const listeners = new Map<string, (...args: unknown[]) => void>()
  let conflict = false
  const bridge = createMaintenanceBridge({
    invoke: async (...args) => {
      calls.push(args)
      return conflict ? { ok: false, error: { code: `MAINTENANCE_CONFLICT`, message: `Reload first` } } : { ok: true, data: args[1] }
    },
    on: (name, listener) => { listeners.set(name, listener) },
    removeListener: name => { listeners.delete(name) }
  })
  const input = { enabled: true, title: `Upgrade`, text: `One\nTwo`, expectedRevision: 4 }
  assert.deepEqual(await bridge.update(input), input)
  assert.deepEqual(calls[0], [`maintenance:update`, input])
  conflict = true
  await assert.rejects(bridge.update(input), { code: `MAINTENANCE_CONFLICT` })
  const events: unknown[] = []
  const unsubscribe = bridge.subscribe(state => events.push(state))
  listeners.get(`maintenance:changed`)?.({}, { initialized: true })
  assert.deepEqual(events, [{ initialized: true }])
  unsubscribe()
  assert.equal(listeners.size, 0)
})
