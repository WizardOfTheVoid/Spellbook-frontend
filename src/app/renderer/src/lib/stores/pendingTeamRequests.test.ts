import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import { createPendingTeamRequests } from './pendingTeamRequests'

function scheduler() {
  const callbacks = new Map<number, () => void>()
  let sequence = 0
  return {
    callbacks,
    setInterval(run: () => void) {
      callbacks.set(++sequence, run)
      return sequence
    },
    clearInterval(id: number) { callbacks.delete(id) }
  }
}

test(`polls for the active account and clears the count and timer on logout`, async () => {
  const clock = scheduler()
  let count = 3
  const state = createPendingTeamRequests(async () => count, clock)
  state.syncUser(1)
  await state.refresh()
  assert.equal(get(state), 3)
  count = 0
  await state.refresh()
  assert.equal(get(state), 0)
  assert.equal(clock.callbacks.size, 1)
  state.syncUser(null)
  assert.equal(clock.callbacks.size, 0)
  assert.equal(get(state), 0)
})

test(`a newer refresh or account switch rejects stale counts`, async () => {
  const resolvers: Array<(value: number) => void> = []
  const state = createPendingTeamRequests(() => new Promise(resolve => resolvers.push(resolve)), scheduler())
  state.syncUser(1)
  const refreshed = state.refresh()
  resolvers[1](2)
  await refreshed
  resolvers[0](9)
  await Promise.resolve()
  assert.equal(get(state), 2)
  const stale = state.refresh()
  state.syncUser(2)
  resolvers[2](8)
  await stale
  assert.equal(get(state), 0)
  resolvers[3](1)
  await Promise.resolve()
  assert.equal(get(state), 1)
  state.syncUser(null)
})

test(`refresh failures retain the last count and recover on retry`, async () => {
  let fail = false
  const state = createPendingTeamRequests(async () => {
    if (fail) throw new Error(`offline`)
    return 4
  }, scheduler())
  state.syncUser(1)
  await state.refresh()
  fail = true
  await state.refresh()
  assert.equal(get(state), 4)
  fail = false
  await state.refresh()
  assert.equal(get(state), 4)
  state.syncUser(null)
})
