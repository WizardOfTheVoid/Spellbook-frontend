import assert from 'node:assert/strict'
import test from 'node:test'
import { ActionWorker } from './actionWorker'
import { ActionClient } from './actionClient'
import { CurrentGameSnapshotStore } from '../currentGameSnapshotStore'
import type { ActionClaim, ActionStart } from '@spellbook/shared/actions/actionTypes'

for (const code of [`DUPLICATE_ACTIVE_BAN`, `DUPLICATE_BAN_COMMAND`, `ACTION_ALREADY_STARTED`, `NETWORK_ERROR`]) {
  test(`start response ${code} preserves its outcome without native submission`, async t => {
    const expectedCancellation = code.startsWith(`DUPLICATE_`)
    const warning = t.mock.method(console, `warn`, () => {})
    const info = t.mock.method(console, `info`, () => {})
    const snapshots = new CurrentGameSnapshotStore()
    snapshots.replace({ gameServerId: 1, externalId: `server`, observedAt: new Date().toISOString(), serverName: `Test`, serverAddress: null, players: [], parseWarnings: [] })
    const claim = { run: { id: 1, gameServerId: 1 }, token: `token` } as ActionClaim
    const message = `Server response for ${code}`
    const requests: string[] = []
    const client = new ActionClient({ postServer: async path => {
      requests.push(path)
      if (path === `/actions/poll`) return { ok: true, status: 200, statusText: `OK`, data: { data: { claims: requests.length === 1 ? [claim] : [], cancel: [] } } }
      return { ok: false, status: code === `NETWORK_ERROR` ? 0 : 409, statusText: `Rejected`, data: { ok: false, error: { code, message } } }
    } })
    let executions = 0
    const worker = new ActionWorker(client, { execute: async () => { executions++; throw new Error(`Unexpected submission`) } }, snapshots, async () => {})
    t.after(() => worker.stop())
    worker.start()
    await new Promise(resolve => setImmediate(resolve))
    await worker.runNow()
    await worker.stop()
    assert.equal(executions, 0)
    assert.deepEqual(requests, [`/actions/poll`, `/actions/1/start`, `/actions/poll`])
    assert.equal(warning.mock.callCount(), expectedCancellation ? 0 : 1)
    assert.equal(info.mock.callCount(), expectedCancellation ? 1 : 0)
    if (expectedCancellation) {
      assert.ok(info.mock.calls[0].arguments.some(value => typeof value === `string` && value.includes(message)))
      assert.ok(info.mock.calls[0].arguments.every(value => !(value instanceof Error)))
    }
  })
}

test(`result delivery retries never submit commands again`, async () => {
  const snapshots = new CurrentGameSnapshotStore()
  snapshots.replace({ gameServerId: 1, externalId: `server`, observedAt: new Date().toISOString(), serverName: `Test`, serverAddress: null, players: [], parseWarnings: [] })
  let executions = 0
  let reports = 0
  let polls = 0
  const claim = { run: { id: 1, gameServerId: 1, target: { type: `server` }, priority: `normal` }, token: `token` } as ActionClaim
  const worker = new ActionWorker({
    poll: async () => ({ claims: polls++ === 0 ? [claim] : [], cancel: [], serverTime: new Date().toISOString() }),
    start: async () => ({ run: claim.run, coreActionId: `core`, serverTime: new Date().toISOString(), expiresAt: new Date(Date.now() + 10000).toISOString() }) as ActionStart,
    report: async () => { if (++reports === 1) throw new Error(`offline`); return {} }
  }, { execute: async () => { executions++; return { result: { ok: true, status: 200, statusText: `OK`, data: { data: { status: `completed`, sentCommands: 1 } } }, prepared: { commands: [], spans: [], nativeCount: 1 } } } }, snapshots, async () => {})
  worker.start()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(reports, 1, `results are reported immediately without another poll`)
  await worker.runNow()
  assert.equal(executions, 1)
  assert.equal(reports, 2)
  await worker.stop()
})

test(`worker polls every four seconds`, async t => {
  t.mock.timers.enable({ apis: [`setInterval`] })
  const snapshots = new CurrentGameSnapshotStore()
  snapshots.replace({ gameServerId: 1, externalId: `server`, observedAt: new Date().toISOString(), serverName: `Test`, serverAddress: null, players: [], parseWarnings: [] })
  let polls = 0
  const worker = new ActionWorker({ poll: async () => { polls++; return { claims: [], cancel: [], serverTime: new Date().toISOString() } },
    start: async () => { throw new Error(`No claim`) }, report: async () => {}
  }, { execute: async () => { throw new Error(`No claim`) } }, snapshots, async () => {})
  t.after(() => worker.stop())
  worker.start()
  await worker.runNow()
  t.mock.timers.tick(3999)
  assert.equal(polls, 1)
  t.mock.timers.tick(1)
  await worker.runNow()
  assert.equal(polls, 2)
})

test(`one poll starts ten actions before any finishes and reports each result independently`, async () => {
  const snapshots = new CurrentGameSnapshotStore()
  snapshots.replace({ gameServerId: 1, externalId: `server`, observedAt: new Date().toISOString(), serverName: `Test`, serverAddress: null, players: [], parseWarnings: [] })
  const started: number[] = []
  const executions: number[] = []
  const reports: number[] = []
  const finish = new Map<number, () => void>()
  const claims = Array.from({ length: 10 }, (_, index) => ({ run: { id: index + 1, gameServerId: 1, target: { type: `server` }, priority: `normal` }, token: `token-${index}` } as ActionClaim))
  const worker = new ActionWorker({
    poll: async () => ({ claims, cancel: [], serverTime: new Date().toISOString() }),
    start: async id => {
      started.push(id)
      return { run: claims[id - 1]!.run, coreActionId: String(id), serverTime: new Date().toISOString(), expiresAt: new Date(Date.now() + 30000).toISOString() } as ActionStart
    },
    report: async id => { reports.push(id) }
  }, { execute: async (_recipe, _target, _context, options) => {
    const id = Number(options.id)
    executions.push(id)
    await new Promise<void>(resolve => finish.set(id, resolve))
    return { result: { ok: true, status: 200, statusText: `OK`, data: { data: { status: `completed`, sentCommands: 1 } } }, prepared: { commands: [], spans: [], nativeCount: 1 } }
  } }, snapshots, async () => {})
  worker.start()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(started.length, 10)
  assert.equal(executions.length, 10)
  assert.deepEqual(reports, [])
  finish.get(5)!()
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(reports, [5])
  for (const resolve of finish.values()) resolve()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(new Set(reports).size, 10)
  await worker.stop()
})
