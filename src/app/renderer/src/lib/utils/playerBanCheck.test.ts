import assert from 'node:assert/strict'
import test from 'node:test'
import type { ActionCommand } from '@spellbook/shared/actions/actionTypes'
import { checkPlayerBans } from './playerBanCheck'

test(`preflight sends the policy and uses only a valid server-resolved duration`, async () => {
  const original = Object.getOwnPropertyDescriptor(globalThis, `window`)
  const calls: unknown[] = []
  let durationHours: unknown = 999999
  const command: ActionCommand = { commandType: `incremental_ban`, sortOrder: 0, delayMs: 0, message: `Reason`, offenseType: `griefing`,
    incrementalBan: { windowDays: 90, offenseTypes: [`griefing`], stages: [{ banCount: 1, durationHours: 24 }, { banCount: 4, durationHours: 999999 }] } }
  Object.defineProperty(globalThis, `window`, { configurable: true, value: { chivServer: {
    actions: async (operation: string, input: unknown) => {
      calls.push([operation, input])
      return { ok: true, status: 200, statusText: `OK`, data: { ok: true, data: { allowed: true, durationHours } } }
    }
  } } })
  try {
    const resolved = await checkPlayerBans(`PLAYER1`, 44, [command])
    assert.equal(resolved[0].commandType, `ban`)
    assert.equal(resolved[0].durationHours, 999999)
    assert.equal(resolved[0].incrementalBan, undefined)
    assert.deepEqual(calls, [[`checkPlayerAction`, { playfabId: `PLAYER1`, gameServerId: 44,
      actionType: `ban`, offenseType: `griefing`, duration: 1, scope: `local`, incrementalBan: command.incrementalBan }]])
    assert.equal(command.commandType, `incremental_ban`)
    for (const invalid of [undefined, `72`, 0, 1.5, 1000000]) {
      durationHours = invalid
      await assert.rejects(checkPlayerBans(`PLAYER1`, 44, [command]), /resolve incremental ban/)
    }
  } finally {
    if (original) Object.defineProperty(globalThis, `window`, original)
    else delete (globalThis as { window?: unknown }).window
  }
})
