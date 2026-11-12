import assert from 'node:assert/strict'
import test from 'node:test'
import type { AdminUserRecord } from '../../../core'

async function controller(load: (limit: number, offset: number) => Promise<AdminUserRecord[]>) {
  const module = await import(`./userListController`).catch(() => ({}))
  const Controller = Reflect.get(module, `UserListController`)
  assert.equal(typeof Controller, `function`)
  return new Controller(load) as import('./userListController').UserListController
}

test(`user directory loads all 201 users before replacing a complete snapshot`, async () => {
  const directory = Array.from({ length: 201 }, (_, index) => ({ id: index + 1 })) as AdminUserRecord[]
  let fail = false
  const list = await controller(async (limit, offset) => {
    assert.equal(limit, 200)
    if (fail && offset === 200) throw new Error(`Unavailable`)
    return directory.slice(offset, offset + limit)
  })
  await list.refresh()
  assert.equal(list.state.users.length, 201)
  fail = true
  await list.refresh()
  assert.equal(list.state.users.length, 201)
  assert.equal(list.state.error, `Unavailable`)
})

test(`duplicate refreshes and disposed directory loads cannot replace state`, async () => {
  let finish!: (users: AdminUserRecord[]) => void
  const pending = new Promise<AdminUserRecord[]>(resolve => { finish = resolve })
  let calls = 0
  const list = await controller(async () => { calls++
    return pending })
  const first = list.refresh()
  await list.refresh()
  list.destroy()
  finish([{ id: 1 }] as AdminUserRecord[])
  await first
  assert.equal(calls, 1)
  assert.deepEqual(list.state.users, [])
})
