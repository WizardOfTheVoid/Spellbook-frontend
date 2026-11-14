import assert from 'node:assert/strict'
import test from 'node:test'
import type { RulesetDebugSnapshot } from '@spellbook/shared/rulesets/ruleDiagnostics'
import { DebugRulesetStream, type DebugRulesetState } from './debugRulesetStream'
import { deferred, flush } from './debugTestHarness'

const snapshot: RulesetDebugSnapshot = { gameServerId: 1, serverTime: 1000, nextTickAt: 5000, lastTickAt: null,
  running: true, evaluating: false, paused: false, error: null, rosterReceivedAt: null, rules: [] }

test(`ruleset polling starts with debug, clears stale data on failure and stops with debug`, async () => {
  const states: DebugRulesetState[] = []
  let refresh: (() => void) | null = null
  let requests = 0
  const stream = new DebugRulesetStream(async () => {
    requests++
    if (requests === 2) throw new Error(`Server unavailable`)
    return snapshot
  }, {
    setTimeout: (callback, delay) => {
      assert.equal(delay, 1000)
      refresh = callback
      return 1
    },
    clearTimeout: () => { refresh = null }
  }, () => 2000, state => states.push(state))
  assert.equal(requests, 0)
  stream.setEnabled(true)
  await flush()
  assert.deepEqual(states.at(-1), { snapshot, receivedAt: 2000, error: null })
  const runRefresh = refresh as (() => void) | null
  assert.ok(runRefresh)
  runRefresh()
  await flush()
  assert.deepEqual(states.at(-1), { snapshot: null, receivedAt: 2000, error: `Server unavailable` })
  stream.setEnabled(false)
  assert.equal(refresh, null)
  assert.equal(states.at(-1)?.snapshot, null)
  assert.equal(requests, 2)
})

test(`a late ruleset response cannot restore data or polling after debug is disabled`, async () => {
  const response = deferred<RulesetDebugSnapshot>()
  const states: DebugRulesetState[] = []
  let scheduled = 0
  const stream = new DebugRulesetStream(async () => response.promise, {
    setTimeout: () => ++scheduled, clearTimeout: () => {}
  }, () => 2000, state => states.push(state))
  stream.setEnabled(true)
  stream.setEnabled(false)
  const count = states.length
  response.resolve(snapshot)
  await flush()
  assert.equal(states.length, count)
  assert.equal(states.at(-1)?.snapshot, null)
  assert.equal(scheduled, 0)
})
