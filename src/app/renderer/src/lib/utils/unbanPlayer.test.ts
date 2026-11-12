import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoreCallResult } from '$lib/core'
import {
	resolveCurrentGameServerId,
	unbanPlayer,
	type UnbanPlayerDependencies,
} from './unbanPlayer'

const success: CoreCallResult = {
	ok: true,
	status: 200,
	statusText: `OK`,
	data: { ok: true, data: {} },
}

test(`local unban validates its server and records removal only after the command succeeds`, async () => {
  const calls: unknown[] = []
  const result = await unbanPlayer({ playerId: 42, playfabId: `PLAYER_1`, gameServerId: 3, actionId: 9, removeOffense: true }, dependencies({
    validateUnban: async (...input) => { calls.push(input) },
    coreUnban: async () => { calls.push(`command`); return success },
    recordRelatedUnban: async input => { calls.push(input) },
  }))
  assert.equal(result.ok, true)
  assert.deepEqual(calls, [[42, 3, 9], `command`, { playerId: 42, actionId: 9, gameServerId: 3, removeOffense: true }])
})

test(`inactive bans and changed servers cannot send local unban commands`, async () => {
  for (const gameServerId of [4, 3]) {
    const result = await unbanPlayer({ playerId: 42, playfabId: `PLAYER_1`, gameServerId }, dependencies({
      validateUnban: async () => { throw new Error(`No active ban`) },
      coreUnban: async () => { assert.fail(`No command allowed`) },
    }))
    assert.equal(result.ok, false)
  }
})

test(`records an unrelated unban by PlayFab without an action relation`, async () => {
	const calls: unknown[][] = []
	await unbanPlayer(
		{ playerId: 42, playfabId: `PLAYER_1`, playerName: `Samwise` },
		dependencies({
			coreUnban: async playfabId => {
				calls.push([`core.unban`, playfabId])
				return success
			},
			recordUnrelatedUnban: async input => {
				calls.push([`server.unbanByPlayfab`, input])
			},
		}),
	)

	assert.deepEqual(calls, [
		[`core.unban`, `PLAYER_1`],
		[`server.unbanByPlayfab`, {
			playfabId: `PLAYER_1`,
			playerName: `Samwise`,
			gameServerId: 3,
		}],
	])
})

test(`blocks in the main menu before Core or audit`, async () => {
	let coreCalls = 0
	let auditCalls = 0
	const result = await unbanPlayer(
		{ playerId: 42, playfabId: `PLAYER_1` },
		dependencies({
			resolveCurrentGameServerId: async () => null,
			coreUnban: async () => {
				coreCalls += 1
				return success
			},
			recordUnrelatedUnban: async () => {
				auditCalls += 1
			},
		}),
	)

	assert.equal(coreCalls, 0)
	assert.equal(auditCalls, 0)
	assert.deepEqual(result, {
		ok: false,
		message: `Current server was not resolved.`,
	})
})

test(`skips the audit when Core rejects the unban`, async () => {
	let auditCalls = 0
	const result = await unbanPlayer(
		{ playerId: 42, playfabId: `PLAYER_1`, actionId: 9 },
		dependencies({
			coreUnban: async () => ({
				ok: false,
				status: 500,
				statusText: `Internal Server Error`,
				data: { ok: false, error: { message: `Console rejected unban.` } },
			}),
			recordRelatedUnban: async () => {
				auditCalls += 1
			},
		}),
	)

	assert.equal(auditCalls, 0)
	assert.deepEqual(result, { ok: false, message: `Console rejected unban.` })
})

test(`reports the existing audit warning after Core succeeds`, async () => {
	const result = await unbanPlayer(
		{ playerId: 42, playfabId: `PLAYER_1`, actionId: 9 },
		dependencies({
			recordRelatedUnban: async () => {
				throw new Error(`Database unavailable.`)
			},
		}),
	)

	assert.deepEqual(result, {
		ok: false,
		message: `Command sent, but audit record failed: Database unavailable.`,
		auditFailed: true,
	})
})

test(`maps the current Main snapshot lobby through the server API`, async () => {
	const externalIds: Array<string | null | undefined> = []
	const gameServerId = await resolveCurrentGameServerId(
		async () => ({
			externalId: `lobby-B`,
			serverName: `Arena`,
			players: [],
		}),
		async externalId => {
			externalIds.push(externalId)
			return {
				gameServer: { id: 8, externalId: `lobby-B` },
			}
		},
	)

	assert.deepEqual(externalIds, [`lobby-B`])
	assert.equal(gameServerId, 8)
})

test(`does not map a main-menu current Main snapshot`, async () => {
	let profileCalls = 0
	const gameServerId = await resolveCurrentGameServerId(
		async () => ({
			externalId: `stale-lobby-A`,
			serverName: `Hastings`,
			players: [{ index: 0, name: `Local player`, playfabId: `NULL`, rawLine: `row` }],
		}),
		async () => {
			profileCalls += 1
			return { gameServer: { id: 3, externalId: `stale-lobby-A` } }
		},
	)

	assert.equal(profileCalls, 0)
	assert.equal(gameServerId, null)
})

function dependencies(
	overrides: Partial<UnbanPlayerDependencies> = {},
): UnbanPlayerDependencies {
	return {
		validateUnban: async () => {},
		resolveCurrentGameServerId: async () => 3,
		coreUnban: async () => success,
		recordRelatedUnban: async () => {},
		recordUnrelatedUnban: async () => {},
		...overrides,
	}
}

function installWantedApi(response: CoreCallResult): () => void {
	const original = Object.getOwnPropertyDescriptor(globalThis, `window`)
	Object.defineProperty(globalThis, `window`, {
		configurable: true,
		value: {
			chivServer: {
				wanted: { get: async () => response },
			},
		},
	})
	return () => {
		if (original) Object.defineProperty(globalThis, `window`, original)
		else delete (globalThis as { window?: unknown }).window
	}
}

function failure(status: number, code: string, message: string): CoreCallResult {
	return {
		ok: false,
		status,
		statusText: `Error`,
		data: { ok: false, error: { code, message } },
	}
}
