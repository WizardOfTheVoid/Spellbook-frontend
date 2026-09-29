import assert from 'node:assert/strict'
import test from 'node:test'
import { ActionWorker } from './actionWorker'
import { CurrentGameSnapshotStore } from '../currentGameSnapshotStore'
import type { ActionClaim, ActionStart } from '@spellbook/shared/actions/actionTypes'

test(`stopping cancels remaining input and reports partial commands before logout`, async () => {
  const snapshots = new CurrentGameSnapshotStore()
  snapshots.replace({ gameServerId: 1, externalId: `server`, observedAt: new Date().toISOString(), serverName: `Test`, serverAddress: null, players: [], parseWarnings: [] })
  const events: string[] = []
  let finish!: (value: never) => void
  const native = new Promise<never>(resolve => finish = resolve)
  const claim = { run: { id: 1, executorId: 2, gameServerId: 1, target: { type: `server` }, priority: `normal` }, token: `token` } as ActionClaim
  const worker = new ActionWorker({ poll: async () => ({ claims: [claim], cancel: [], serverTime: new Date().toISOString() }),
    start: async () => ({ run: claim.run, coreActionId: `core`, serverTime: new Date().toISOString(), expiresAt: new Date(Date.now() + 10000).toISOString() }) as ActionStart,
    report: async (_id, _token, result) => { events.push(`report:${result.sentCommands}`); return {} }
  }, { execute: async () => native }, snapshots, async () => {
    events.push(`cancel`)
    finish({ result: { ok: false, status: 409, data: { data: { status: `cancelled`, sentCommands: 1 } } }, prepared: {} } as never)
  })
  worker.start()
  await new Promise(resolve => setImmediate(resolve))
  await worker.stop()
  assert.deepEqual(events, [`cancel`, `report:1`])
})

for (const pendingStart of [true, false]) test(`stop handles every batch member while ${pendingStart ? `starting` : `executing`}`, async () => {
  const snapshots = new CurrentGameSnapshotStore()
  snapshots.replace({ gameServerId: 1, externalId: `server`, observedAt: new Date().toISOString(), serverName: `Test`, serverAddress: null, players: [], parseWarnings: [] })
  const release: (() => void)[] = []
  const finish = new Map<string, (value: never) => void>()
  const cancelled: string[] = []
  const reports: number[] = []
  const claims = Array.from({ length: 10 }, (_, id) => ({ run: { id: id + 1, gameServerId: 1 }, token: String(id) } as ActionClaim))
  const worker = new ActionWorker({
    poll: async () => ({ claims, cancel: [], serverTime: new Date().toISOString() }),
    start: async id => {
      if (pendingStart) await new Promise<void>(resolve => release.push(resolve))
      return { run: claims[id - 1]!.run, coreActionId: String(id), serverTime: new Date().toISOString(), expiresAt: new Date(Date.now() + 60000).toISOString() } as ActionStart
    },
    report: async (id, _token, result) => { assert.equal(result.sentCommands, 0); reports.push(id) }
  }, { execute: async (_recipe, _target, _context, options) => new Promise<never>(resolve => finish.set(options.id!, resolve)) }, snapshots, async id => {
    cancelled.push(id)
    finish.get(id)!({ result: { data: { data: { status: `cancelled`, sentCommands: 0 } } } } as never)
  })
  worker.start()
  await new Promise(resolve => setImmediate(resolve))
  const stopping = worker.stop()
  for (const resolve of release) resolve()
  await stopping
  assert.equal(new Set(reports).size, 10)
  assert.equal(cancelled.length, pendingStart ? 0 : 10)
  assert.equal(finish.size, pendingStart ? 0 : 10, `late start responses never submit native work after stop`)
})
