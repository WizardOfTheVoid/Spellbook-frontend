import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { PlayerAction } from '$lib/core'
import { authState } from '$lib/auth/user'
import { loadOffenseMenu } from './offenseActions'
import { offenseRemoval } from './offenseRemovalState'

test(`offline standalone unban opens server selection without submitting an action`, async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, `window`)
  Object.defineProperty(globalThis, `window`, { configurable: true, value: {
    chivCore: { currentGameSnapshot: async () => null },
    chivServer: { actions: async () => { throw new Error(`No action should be submitted before confirmation`) } },
  } })
  t.after(() => {
    offenseRemoval.set(null)
    if (previous) Object.defineProperty(globalThis, `window`, previous)
    else Reflect.deleteProperty(globalThis, `window`)
  })
  const ban = { id: 9, actionType: `ban`, gameServerId: 2 } as PlayerAction
  const target = { playerId: 42, playfabId: `PLAYER`, name: `Player` }
  const menu = await loadOffenseMenu(target, { actions: [ban], activeBans: [ban] })
  const action = menu[0]!.children!.find(item => item.name === `Unban without offense`)?.action
  assert.equal(typeof action, `function`)
  if (typeof action === `function`) await action()
  assert.deepEqual(get(offenseRemoval), {
    target, actionId: undefined, standalone: true,
  })
})

test(`server menu offers standalone unban without a tracked ban and nests active offenses`, async () => {
  const target = { playerId: 42, playfabId: `PLAYER`, name: `Player`, gameServerId: 2 }
  const ban = { id: 9, actionType: `ban`, offenseType: `ffa`, gameServerId: 2 } as PlayerAction
  const empty = await loadOffenseMenu(target, { actions: [], activeBans: [] })
  assert.deepEqual(empty.map(item => item.name), [`Unban`])
  assert.deepEqual(empty[0]!.children!.map(item => item.name), [`Unban without offense`])

  const menu = await loadOffenseMenu(target, { actions: [ban], activeBans: [ban] })
  assert.deepEqual(menu.map(item => item.name), [`Unban`, `Remove offense`])
  assert.deepEqual(menu[0]!.children!.map(item => item.name), [`FFA`, `Unban without offense`])
  assert.deepEqual(menu[0]!.children![0]!.children!.map(item => item.name), [`Unban and remove offense`])
  assert.equal(typeof menu[1]!.children![0]!.children![0]!.action, `function`)
})

test(`standalone unban without a tracked ban requests the selected server`, async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, `window`)
  const requests: { operation: string, input: unknown }[] = []
  Object.defineProperty(globalThis, `window`, { configurable: true, value: {
    chivCore: { currentGameSnapshot: async () => null },
    chivServer: { actions: async (operation: string, input: unknown) => {
      requests.push({ operation, input })
      return { ok: true, status: 200, data: {} }
    } },
  } })
  authState.set({ loading: false, user: { id: 7 } as never })
  t.after(() => {
    authState.set({ loading: true, user: null })
    if (previous) Object.defineProperty(globalThis, `window`, previous)
    else Reflect.deleteProperty(globalThis, `window`)
  })
  const target = { playerId: 42, playfabId: `PLAYER`, name: `Player`, gameServerId: 2 }
  const menu = await loadOffenseMenu(target, { actions: [], activeBans: [] })
  const action = menu[0]!.children![0]!.action
  assert.equal(typeof action, `function`)
  if (typeof action === `function`) await action()
  assert.equal(requests.length, 1)
  assert.equal(requests[0]!.operation, `unbanRequest`)
  const input = requests[0]!.input as { requestKey: string, gameServerId: number, playerId: number }
  assert.match(input.requestKey, /^[0-9a-f-]{36}$/u)
  assert.equal(input.gameServerId, 2)
  assert.equal(input.playerId, 42)
})
