import assert from 'node:assert/strict'
import test from 'node:test'
import { dispatchRequest } from './requestDispatch'

test(`same-server actions execute locally and a failure never becomes a remote request`, async () => {
  let requests = 0
  await assert.rejects(dispatchRequest({ gameServerId: 1, observedAt: new Date().toISOString() }, 1,
    async () => { throw new Error(`Native input failed`) }, async () => { requests++ }), /Native input failed/)
  assert.equal(requests, 0)
})

test(`offline, stale and other-server actions create one request without local input`, async () => {
  let requests = 0
  let inputs = 0
  for (const snapshot of [null, { gameServerId: 2, observedAt: new Date().toISOString() }, { gameServerId: 1, observedAt: new Date(0).toISOString() }]) {
    await dispatchRequest(snapshot, 1, async () => { inputs++ }, async () => { requests++ })
  }
  assert.equal(requests, 3)
  assert.equal(inputs, 0)
})
