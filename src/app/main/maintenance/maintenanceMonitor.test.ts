import assert from 'node:assert/strict'
import test from 'node:test'
import { MaintenanceMonitor } from './maintenanceMonitor'

const state = (enabled: boolean, revision = 1) => ({ enabled, revision, title: `Custom title`, text: `Line one\nLine two` })

test(`an unavailable API's disabled cache cannot end confirmed maintenance`, async () => {
  let value = { maintenance: state(true, 9), databaseReady: true }
  const monitor = new MaintenanceMonitor({ read: async () => value })
  await monitor.refresh()
  value = { maintenance: state(false, 8), databaseReady: false }
  await monitor.refresh()
  assert.equal(monitor.snapshot().maintenance?.enabled, true)
  assert.equal(monitor.snapshot().maintenance?.revision, 9)
  value = { maintenance: state(false, 2), databaseReady: true }
  await monitor.refresh()
  assert.equal(monitor.snapshot().maintenance?.enabled, false)
})

test(`a database-ready response with unknown maintenance cannot release startup`, async () => {
  const monitor = new MaintenanceMonitor({ read: async () => ({ maintenance: null, databaseReady: true }) })
  await monitor.refresh()
  assert.equal(monitor.snapshot().initialized, false)
})

test(`maintenance survives failed polling and can accept a lower restored database revision`, async () => {
  let value = { maintenance: state(true, 9), databaseReady: true }
  let fail = false
  const saved: unknown[] = []
  const monitor = new MaintenanceMonitor({
    read: async () => { if (fail) throw new Error(`offline`); return value },
    save: async snapshot => { saved.push(snapshot) }
  })
  await monitor.refresh()
  fail = true
  await monitor.refresh()
  assert.equal(monitor.snapshot().maintenance?.enabled, true)
  assert.equal(monitor.snapshot().error, `offline`)
  fail = false
  value = { maintenance: state(false, 2), databaseReady: true }
  await monitor.refresh()
  assert.equal(monitor.snapshot().maintenance?.revision, 2)
  assert.equal(monitor.snapshot().maintenance?.enabled, false)
  assert.equal(saved.length, 2)
})

test(`one poll is in flight and an admin save invalidates its late response`, async () => {
  const pending = Promise.withResolvers<{ maintenance: ReturnType<typeof state>, databaseReady: boolean }>()
  let calls = 0
  const monitor = new MaintenanceMonitor({ read: async () => { calls += 1; return pending.promise } })
  const first = monitor.refresh()
  const second = monitor.refresh()
  assert.equal(calls, 1)
  await monitor.acceptSaved(state(false, 10))
  pending.resolve({ maintenance: state(true, 9), databaseReady: true })
  await Promise.all([first, second])
  assert.equal(monitor.snapshot().maintenance?.enabled, false)
  assert.equal(monitor.snapshot().maintenance?.revision, 10)
})

test(`unknown status stays uninitialized on failure and a cached active state is retained`, async () => {
  const read = async () => { throw new Error(`offline`) }
  const unknown = new MaintenanceMonitor({ read })
  await unknown.refresh()
  assert.equal(unknown.snapshot().initialized, false)
  const cachedInactive = new MaintenanceMonitor({ read, cached: state(false, 3) })
  await cachedInactive.refresh()
  assert.equal(cachedInactive.snapshot().initialized, false)
  const cached = new MaintenanceMonitor({ read, cached: state(true, 3) })
  await cached.refresh()
  assert.equal(cached.snapshot().initialized, true)
  assert.equal(cached.snapshot().maintenance?.enabled, true)
  assert.equal(cached.snapshot().databaseReady, false)
})

test(`stopping monitoring prevents a late response from changing state`, async () => {
  const pending = Promise.withResolvers<{ maintenance: ReturnType<typeof state>, databaseReady: boolean }>()
  const monitor = new MaintenanceMonitor({ read: async () => pending.promise })
  const refresh = monitor.refresh()
  monitor.stop()
  pending.resolve({ maintenance: state(true), databaseReady: true })
  await refresh
  assert.equal(monitor.snapshot().maintenance, null)
})
