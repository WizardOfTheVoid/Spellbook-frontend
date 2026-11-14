import assert from 'node:assert/strict'
import test from 'node:test'
import { createPlayerRosterRequest } from './playerRosterRequest'
import type { PlayerPage } from './playersApi'

test(`typing reuses the roster load while a changed roster cancels its own obsolete request`, async () => {
  let loads = 0
  let cancellations = 0
  const pending = Promise.withResolvers<PlayerPage>()
  const loader = createPlayerRosterRequest(async () => { loads++; return pending.promise }, () => { cancellations++ })
  const first = loader.read([`P1`], 1)
  const same = loader.read([`P1`], 1)
  assert.equal(loads, 1)
  const next = loader.read([`P1`, `P2`], 1)
  assert.equal(loads, 2)
  assert.equal(cancellations, 1)
  pending.resolve({ players: [], meta: {
    currentPage: 1, pageSize: 100, totalPages: 0, totalResults: 0, hasNext: false, hasPrevious: false
  } })
  const completed = await Promise.allSettled([first, same, next])
  assert.deepEqual(completed.map(result => result.status), [`rejected`, `rejected`, `fulfilled`])
  await loader.read([`P1`, `P2`], 1)
  assert.equal(loads, 2)
  loader.reset()
  assert.equal(cancellations, 1)
})

test(`an unknown-only roster never requests the global directory and reset rejects stale enrichment`, async () => {
  const pending = Promise.withResolvers<PlayerPage>()
  let calls = 0
  const loader = createPlayerRosterRequest(async () => { calls++; return pending.promise }, () => {})
  const empty = await loader.read([], 1)
  assert.equal(calls, 0)
  assert.deepEqual(empty.players, [])
  const stale = loader.read([`P1`], 2)
  loader.reset()
  pending.resolve(empty)
  await assert.rejects(stale, { name: `AbortError` })
})
