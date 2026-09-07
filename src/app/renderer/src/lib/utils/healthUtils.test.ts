import assert from 'node:assert/strict'
import test from 'node:test'
import { formatPlayFabDetail } from './healthUtils'

test('formats nested PlayFab status for a health card', () => {
  assert.equal(formatPlayFabDetail({
    running: true,
    latencyMs: 7,
    health: {
      running: true,
      status: 'ok'
    }
  }), 'ok')
})

test('falls back when PlayFab status is unavailable', () => {
  assert.equal(formatPlayFabDetail(null), 'No response')
})
