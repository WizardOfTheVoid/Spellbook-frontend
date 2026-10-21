import assert from 'node:assert/strict'
import test from 'node:test'
import type { CurrentServerConnection } from '@spellbook/shared/serverStore'
import { initialGameState } from '../../shared/gameState'
import { CurrentGameSnapshotStore } from './currentGameSnapshotStore'
import { CurrentServerReporter } from './currentServerReporter'

test(`connection heartbeats carry ordered generations and clear travel or unavailable state`, context => {
  context.mock.timers.enable({ apis: [`setInterval`] })
  let state = { ...initialGameState, available: true, running: true, connected: true }
  const snapshots = new CurrentGameSnapshotStore()
  const reports: CurrentServerConnection[] = []
  const reporter = new CurrentServerReporter(snapshots, () => state, `client`, async input => { reports.push(input) })
  reporter.update(7)
  assert.equal(reports.at(-1)?.gameServerId, null)
  snapshots.replace({ observedAt: new Date().toISOString(), gameServerId: 3, externalId: `server`,
    serverName: `Duel`, serverAddress: `host:7777`, players: [], parseWarnings: [] })
  assert.equal(reports.at(-1)?.gameServerId, 3)
  const count = reports.length
  reporter.observe()
  assert.equal(reports.length, count)
  context.mock.timers.tick(15_000)
  assert.equal(reports.length, count + 1)
  snapshots.clear()
  assert.equal(reports.at(-1)?.gameServerId, null)
  assert.ok(reports.at(-1)!.generation > reports[1].generation)
  state = { ...state, available: false }
  reporter.observe()
  assert.equal(reports.at(-1)?.gameServerId, null)
  assert.ok(reports.every((report, index) => index === 0 || report.sequence > reports[index - 1].sequence))
  reporter.update(null)
  const stopped = reports.length
  context.mock.timers.tick(60_000)
  assert.equal(reports.length, stopped)
  reporter.destroy()
})
