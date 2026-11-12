import assert from 'node:assert/strict'
import { setImmediate } from 'node:timers/promises'
import test from 'node:test'
import type { LocalActionReport } from '@spellbook/shared/actionEvents'
import { CoreIpcHandlers } from './core-ipc-handlers'
import { ModerationIpcHandlers } from './moderation-ipc-handlers'
import { ActionBuilder } from '../core/actionBuilder'
import { CurrentGameSnapshotStore } from '../services/currentGameSnapshotStore'
import type { HttpClient } from '../api/http-client'
import { RequestIdFactory } from '../request-id-factory'

test(`local command entry points upload one result each with the captured server and resolved messages`, async () => {
  const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>()
  const ipc = { handle: (key: string, handler: never) => handlers.set(key, handler) }
  const reports: LocalActionReport[] = []
  const snapshots = new CurrentGameSnapshotStore()
  const snapshot = { gameServerId: 3, externalId: `duel`, observedAt: new Date().toISOString(), serverName: `Duel`, serverAddress: null,
    players: [], parseWarnings: [] }
  snapshots.replace(snapshot)
  let executions = 0
  const http = { authenticatedEpoch: 1, commands: new ActionBuilder(),
    callCore: async () => ({ ok: true }),
    getServer: async () => ({ ok: true, data: { ok: true, data: [] } }),
    postServer: async (path: string, report: LocalActionReport) => {
      assert.equal(path, `/actions/local-results`)
      reports.push(report)
      return { ok: true }
    },
    executeAction: async () => {
      executions++
      snapshots.replace({ ...snapshot, gameServerId: 4 })
      return { ok: true, status: 200, statusText: `OK`, data: { data: { status: `failed`, sentCommands: 0 } } }
    }
  } as unknown as HttpClient
  const requestIds = new RequestIdFactory(`local`)
  const activity = { getInactiveGameCommandResult: () => null, beginGameCommandBatch: () => null, endGameCommandBatch: () => {} }
  const access = { check: async () => null }
  new CoreIpcHandlers(ipc as never, http, {} as never, {} as never, snapshots, requestIds, activity as never,
    { sendToCurrent: () => {} } as never, { isInGameServer: () => true } as never, access).register()
  new ModerationIpcHandlers(ipc as never, http, requestIds, activity as never, access, snapshots).register()
  const profileId = 17
  const actionKey = `12345678-1234-1234-1234-123456789abc`
  for (const [channel, payload] of [
    [`core:message`, { kind: `server`, message: `Welcome` }],
    [`core:kick`, { playfabId: `PLAYER`, reason: `Reason` }],
    [`core:ban`, { playfabId: `PLAYER`, reason: `Reason`, hours: 1 }],
    [`core:unban`, { playfabId: `PLAYER` }],
    [`core:warn`, { playfabId: `PLAYER`, message: `Reason` }],
    [`core:actionRecipe`, { gameServerId: 3, target: { type: `server` }, context: { admin: `Admin`, serverName: `Duel` },
      recipe: { profileId, actionKey, label: `Profile say`, iconKey: `bullhorn`, isEnabled: true, delayMs: 0, blockOnMissingVariables: false,
        actionDomain: `server`, commands: [{ commandType: `server_message`, sortOrder: 0, delayMs: 0, message: `Welcome` }] } }]
  ] as const) {
    snapshots.replace(snapshot)
    await handlers.get(channel)!({}, payload)
  }
  await setImmediate()
  assert.equal(executions, 6)
  assert.equal(reports.length, 6)
  assert.equal(new Set(reports.map(report => report.coreActionId)).size, 6)
  assert.equal(reports.every(report => report.gameServerId === 3 && report.status === `failed` && report.sentCommands === 0), true)
  assert.deepEqual(reports.at(-1)?.profile, { profileId, actionKey })
  assert.equal(reports.at(-1)?.action.commands[0].message, `Welcome`)
  assert.equal(reports.at(-1)?.action.iconKey, `bullhorn`)
})
