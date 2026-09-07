import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import { infinityMenuState, closeInfinityMenu } from '../ui/infinityMenu'
import { banAdminUser, canBanAdminUser, loadAdminUserBan, openAdminUserMenu } from './adminUserBan'
import type { AdminUserRecord } from '$lib/core'

const actor = { id: 1, isActive: true, isSuperadmin: true }
const user = { id: 2, displayName: `Player`, bannedAt: null } as AdminUserRecord

test(`opening a ban reloads the selected account and the saved database reason`, async () => {
  const current = { ...user, displayName: `Current name`, banReason: `Saved reason\nSecond line` }
  const loaded = await loadAdminUserBan(user.id, async id => {
    assert.equal(id, user.id)
    return { ok: true, status: 200, statusText: `OK`, data: { ok: true, data: current } }
  })
  assert.deepEqual(loaded, { user: current, reason: current.banReason })
  await assert.rejects(loadAdminUserBan(user.id, async () => ({ ok: false, status: 503, statusText: `Unavailable`, data: null })))
})

test(`only an active superadmin can ban another unbanned account`, () => {
  assert.equal(canBanAdminUser(actor, user), true)
  for (const current of [null, { ...actor, isSuperadmin: false }, { ...actor, isActive: false }, { ...actor, id: user.id }]) {
    assert.equal(canBanAdminUser(current, user), false)
  }
  assert.equal(canBanAdminUser(actor, { ...user, bannedAt: `2026-09-05` }), false)
})

test(`ban submits the selected account and trimmed reason through the existing API`, async () => {
  const calls: unknown[] = []
  await banAdminUser(actor, user, `  Repeated abuse  `, async (...args) => {
    calls.push(args)
    return { ok: true, status: 204, statusText: `No Content`, data: null }
  })
  assert.deepEqual(calls, [[2, `Repeated abuse`]])
})

test(`invalid reasons and self bans never reach the API; server failures remain retryable`, async () => {
  let calls = 0
  const ban = async () => { calls += 1; return { ok: false, status: 403, statusText: `Forbidden`, data: null } }
  for (const reason of [``, `  `, `x`.repeat(501)]) {
    await assert.rejects(banAdminUser(actor, user, reason, ban))
  }
  await assert.rejects(banAdminUser({ ...actor, id: user.id }, user, `Reason`, ban))
  assert.equal(calls, 0)
  await assert.rejects(banAdminUser(actor, user, `Reason`, ban))
  assert.equal(calls, 1)
})

test(`the user row menu opens the profile or requests the ban modal without banning immediately`, async () => {
  const actions: string[] = []
  openAdminUserMenu({ preventDefault() {}, stopPropagation() {}, clientX: 10, clientY: 20, currentTarget: null } as unknown as MouseEvent, {
    actor, user,
    onOpenUser: id => actions.push(`profile:${id}`),
    onBan: target => actions.push(`modal:${target.id}`)
  })
  const menu = get(infinityMenuState)?.menu
  assert.deepEqual(menu?.items.map(item => item.name), [`Open profile`, `Ban user`])
  assert.deepEqual(actions, [])
  for (const item of menu?.items ?? []) {
    if (typeof item.action === `function`) await item.action()
  }
  assert.deepEqual(actions, [`profile:2`, `modal:2`])
  closeInfinityMenu()
})
