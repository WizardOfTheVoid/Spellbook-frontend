import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CurrentGameSnapshotStore,
  type CurrentGameSnapshotInput
} from './currentGameSnapshotStore'

const input = (): CurrentGameSnapshotInput => ({
  observedAt: `2026-08-31T09:59:59.000Z`,
  gameServerId: 13,
  externalId: `lobby-13`,
  serverName: null,
  serverAddress: `127.0.0.1:7777`,
  players: [{
    index: 0,
    name: `  Exact Player  `,
    playfabId: `PLAYER`,
    rawLine: `raw`,
    pingMs: 44
  }],
  parseWarnings: [`warning`]
})

test('snapshot replacement deep-clones and freezes the complete value', () => {
  const source = input()
  const store = new CurrentGameSnapshotStore(() => new Date(`2026-08-31T10:00:00.000Z`))
  const snapshot = store.replace(source)

  source.players[0]!.name = `mutated`
  source.players.push({ ...source.players[0]!, playfabId: `OTHER` })
  source.parseWarnings.push(`other`)

  assert.deepEqual(snapshot, {
    version: 1,
    observedAt: `2026-08-31T09:59:59.000Z`,
    gameServerId: 13,
    externalId: `lobby-13`,
    serverName: null,
    serverAddress: `127.0.0.1:7777`,
    players: [{
      index: 0,
      name: `  Exact Player  `,
      playfabId: `PLAYER`,
      rawLine: `raw`,
      pingMs: 44
    }],
    parseWarnings: [`warning`]
  })
  assert.equal(Object.isFrozen(snapshot), true)
  assert.equal(Object.isFrozen(snapshot.players), true)
  assert.equal(Object.isFrozen(snapshot.players[0]), true)
  assert.equal(Object.isFrozen(snapshot.parseWarnings), true)
})

test('versions remain monotonic across clear and subscribers receive changes', () => {
  const store = new CurrentGameSnapshotStore(() => new Date(`2026-08-31T10:00:00.000Z`))
  const observed: Array<number | null> = []
  const unsubscribe = store.subscribe(snapshot => observed.push(snapshot?.version ?? null))

  assert.equal(store.replace(input()).version, 1)
  assert.equal(store.getNewerThan(0, 13)?.version, 1)
  assert.equal(store.getNewerThan(1, 13), null)
  assert.equal(store.getNewerThan(0, 17), null)
  store.clear()
  assert.equal(store.replace(input()).version, 2)
  unsubscribe()
  store.clear()

  assert.deepEqual(observed, [1, null, 2])
  assert.equal(store.get(), null)
})
