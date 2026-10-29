import assert from 'node:assert/strict'
import test from 'node:test'
import type { AuditLogRecord } from '../../../core'

async function controller(load: (id: number) => Promise<AuditLogRecord[]>) {
  const module = await import(`./userActivityController`).catch(() => ({}))
  const Controller = Reflect.get(module, `UserActivityController`)
  assert.equal(typeof Controller, `function`)
  return new Controller(load) as import('./userActivityController').UserActivityController
}

test(`switching users discards an older activity response`, async () => {
  let finish!: (items: AuditLogRecord[]) => void
  const pending = new Promise<AuditLogRecord[]>(resolve => { finish = resolve })
  const activity = await controller(async id => id === 1 ? pending : [{ id: 22 }] as AuditLogRecord[])
  activity.setContext(7, 1, true)
  const old = activity.refresh()
  activity.setContext(7, 2, true)
  await activity.refresh()
  finish([{ id: 11 }] as AuditLogRecord[])
  await old
  assert.deepEqual(activity.state.records.map(item => item.id), [22])
})

test(`leaving activity or signing out prevents late updates and new requests`, async () => {
  let finish!: (items: AuditLogRecord[]) => void
  const pending = new Promise<AuditLogRecord[]>(resolve => { finish = resolve })
  let calls = 0
  const activity = await controller(async () => { calls++
    return pending })
  activity.setContext(7, 1, true)
  const old = activity.refresh()
  activity.setContext(null, null, false)
  finish([{ id: 11 }] as AuditLogRecord[])
  await old
  await activity.refresh()
  assert.deepEqual(activity.state.records, [])
  assert.equal(calls, 1)
  activity.destroy()
  activity.setContext(7, 1, true)
  await activity.refresh()
  assert.equal(calls, 1)
})

test(`activity failures support retry and successful empty results`, async () => {
  let fail = true
  const activity = await controller(async () => { if (fail) throw new Error(`Unavailable`)
    return [] })
  activity.setContext(7, 1, true)
  await activity.refresh()
  assert.equal(activity.state.error, `Unavailable`)
  fail = false
  await activity.refresh()
  assert.deepEqual(activity.state.records, [])
  assert.equal(activity.state.error, null)
  assert.equal(activity.state.loading, false)
})
