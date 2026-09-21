import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { PlayerAction } from '$lib/core'
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
  const target = { playerId: 42, playfabId: `PLAYER`, name: `Player`, gameServerId: 2 }
  const menu = await loadOffenseMenu(target, { actions: [ban], activeBans: [ban] })
  const action = menu[0]!.children![0]!.action
  assert.equal(typeof action, `function`)
  if (typeof action === `function`) await action()
  assert.deepEqual(get(offenseRemoval), {
    target: { ...target, gameServerId: undefined }, actionId: undefined, standalone: true,
  })
})
