import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import { createMaintenanceSession, canUseMaintenanceAdmin } from './maintenanceSession'

const active = { initialized: true, databaseReady: true, error: null, maintenance: { enabled: true, title: `Work`, text: `Line one\nLine two`, revision: 2 } }

test(`maintenance invalidation epoch changes once per activation, including while panels are unmounted`, () => {
  let publish: (value: typeof active) => void = () => {}
  const session = createMaintenanceSession()
  const stop = session.start({ snapshot: async () => active, subscribe: listener => { publish = listener; return () => {} } })
  publish(active)
  assert.equal(session.epoch(), 1)
  publish({ ...active, maintenance: { ...active.maintenance, revision: 3 } })
  assert.equal(session.epoch(), 1)
  publish({ ...active, maintenance: { ...active.maintenance, enabled: false } })
  assert.equal(session.epoch(), 1)
  publish(active)
  assert.equal(session.epoch(), 2)
  stop()
})

test(`a late initial snapshot cannot replace a newer subscription state and stopping rejects late replies`, async () => {
  let snapshot: (value: typeof active) => void = () => {}
  let publish: (value: typeof active) => void = () => {}
  let stopped = false
  const session = createMaintenanceSession()
  const stop = session.start({ snapshot: async () => await new Promise(resolve => { snapshot = resolve }), subscribe: listener => {
    publish = listener
    return () => { stopped = true }
  } })
  publish(active)
  snapshot({ ...active, maintenance: { ...active.maintenance, enabled: false } })
  await Promise.resolve()
  assert.equal(get(session).maintenance?.enabled, true)
  stop()
  publish({ ...active, maintenance: { ...active.maintenance, enabled: false } })
  assert.equal(stopped, true)
  assert.equal(get(session).maintenance?.enabled, true)
})

test(`only a signed-in active superadmin can open maintenance Admin recovery`, () => {
  assert.equal(canUseMaintenanceAdmin(null), false)
  assert.equal(canUseMaintenanceAdmin({ isActive: true, isSuperadmin: false }), false)
  assert.equal(canUseMaintenanceAdmin({ isActive: false, isSuperadmin: true }), false)
  assert.equal(canUseMaintenanceAdmin({ isActive: true, isSuperadmin: true }), true)
})
