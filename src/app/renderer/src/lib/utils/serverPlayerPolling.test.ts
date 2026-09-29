import assert from "node:assert/strict"
import test from "node:test"
import {
  CurrentGameSnapshotGate,
  formatServerPlayerCount,
} from "./serverPlayerPolling"
import type { CurrentGameSnapshot } from "../core"

test(`formats the current and maximum player counts for a server header`, () => {
  assert.equal(formatServerPlayerCount(18, 40), `(18/40)`)
  assert.equal(formatServerPlayerCount(18, null), `(18/?)`)
})

test(`ignores hydration older than a snapshot event received first`, () => {
  const gate = new CurrentGameSnapshotGate()

  assert.equal(gate.acceptEvent(snapshot(9, `  Original Name  `)), true)
  assert.equal(gate.acceptHydration(snapshot(8, `stale`)), false)
  assert.equal(gate.latestVersion, 9)
})

test(`a null logout event clears state and rejects an in-flight hydration`, () => {
  const gate = new CurrentGameSnapshotGate()

  assert.equal(gate.acceptEvent(null), true)
  assert.equal(gate.acceptHydration(snapshot(9, `stale`)), false)
})

test(`accepts monotonic event snapshots without changing original player names`, () => {
  const gate = new CurrentGameSnapshotGate()
  const current = snapshot(2, `  Original Name  `)

  assert.equal(gate.acceptHydration(current), true)
  assert.equal(gate.acceptEvent(snapshot(1, `old`)), false)
  assert.equal(gate.acceptEvent(snapshot(3, `Next`)), true)
  assert.equal(current.players[0]?.name, `  Original Name  `)
})

function snapshot(version: number, name: string): CurrentGameSnapshot {
  return {
    version,
    observedAt: `2026-08-31T10:00:00.000Z`,
    gameServerId: 13,
    externalId: `lobby-13`,
    serverName: `Duel`,
    serverAddress: null,
    players: [{ index: 0, name, playfabId: `PF-1`, rawLine: name }],
    parseWarnings: []
  }
}
