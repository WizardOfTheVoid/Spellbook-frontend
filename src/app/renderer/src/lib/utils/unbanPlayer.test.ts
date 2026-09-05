import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoreCallResult } from '$lib/core'
import {
	resolveCurrentGameServerId,
	unbanPlayer,
	type UnbanPlayerDependencies,
} from './unbanPlayer'
import { getWantedPlayer } from './wantedActionsApi'

const success: CoreCallResult = {
	ok: true,
	status: 200,
	statusText: `OK`,
	data: { ok: true, data: {} },
}

test(`resolves server B at execution after the menu was created on server A`, async () => {
	const calls: unknown[][] = []
	const menuTimeExternalId = `lobby-A`
	const result = await unbanPlayer(
		{ playerId: 42, playfabId: `PLAYER_1`, playerName: `Alice`, actionId: 9 },
		dependencies({
			fetchWanted: async playerId => {
				calls.push([`server.wanted.get`, playerId])
				return null
			},
			resolveCurrentGameServerId: async () => resolveCurrentGameServerId(
				async () => {
					calls.push([`main.currentGameSnapshot`])
					return { externalId: `lobby-B`, serverName: `Arena`, players: [] }
				},
				async externalId => {
					calls.push([`server.activeProfile`, externalId])
					return { gameServer: { id: 8, externalId: `lobby-B` } }
				},
			),
			coreUnban: async playfabId => {
				calls.push([`core.unban`, playfabId])
				return success
			},
			recordRelatedUnban: async input => {
				calls.push([`server.unban`, input])
			},
		}),
	)

	assert.equal(menuTimeExternalId, `lobby-A`)
	assert.deepEqual(calls, [
		[`server.wanted.get`, 42],
		[`main.currentGameSnapshot`],
		[`server.activeProfile`, `lobby-B`],
		[`core.unban`, `PLAYER_1`],
		[`server.unban`, { playerId: 42, actionId: 9, gameServerId: 8 }],
	])
	assert.deepEqual(result, { ok: true, message: `Player unbanned.` })
})

test(`active Wanted state blocks before snapshot, Core, or audit`, async () => {
	const calls: string[] = []
	const result = await unbanPlayer(
		{ playerId: 42, playfabId: `PLAYER_1`, actionId: 9 },
		dependencies({
			fetchWanted: async () => ({ active: true }),
			resolveCurrentGameServerId: async () => {
				calls.push(`snapshot`)
				return 3
			},
			coreUnban: async () => {
				calls.push(`core`)
				return success
			},
			recordRelatedUnban: async () => {
				calls.push(`audit`)
			}
		}),
	)

	assert.deepEqual(calls, [])
	assert.deepEqual(result, {
		ok: false,
		message: `Wanted actions must be changed from the Wanted page.`,
	})
})

test(`Wanted transport failure fails closed before snapshot, Core, or audit`, async () => {
	const calls: string[] = []
	const result = await unbanPlayer(
		{ playerId: 42, playfabId: `PLAYER_1` },
		dependencies({
			fetchWanted: async () => {
				throw new Error(`Session expired.`)
			},
			resolveCurrentGameServerId: async () => {
				calls.push(`snapshot`)
				return 3
			},
			coreUnban: async () => {
				calls.push(`core`)
				return success
			},
			recordUnrelatedUnban: async () => {
				calls.push(`audit`)
			}
		}),
	)

	assert.deepEqual(calls, [])
	assert.deepEqual(result, { ok: false, message: `Session expired.` })
})

test(`generic or malformed Wanted 404 fails closed before server resolution, Core, or audit`, async () => {
	for (const response of [
		failure(404, `NOT_FOUND`, `Route was not found.`),
		{
			ok: false,
			status: 404,
			statusText: `Not Found`,
			data: { ok: false, error: `Malformed error.` },
		} satisfies CoreCallResult,
	]) {
		const calls: string[] = []
		const restore = installWantedApi(response)
		try {
			const result = await unbanPlayer(
				{ playerId: 42, playfabId: `PLAYER_1` },
				dependencies({
					fetchWanted: getWantedPlayer,
					resolveCurrentGameServerId: async () => {
						calls.push(`server resolution`)
						return 3
					},
					coreUnban: async () => {
						calls.push(`Core`)
						return success
					},
					recordUnrelatedUnban: async () => {
						calls.push(`audit`)
					},
				}),
			)

			assert.deepEqual(calls, [])
			assert.equal(result.ok, false)
		} finally {
			restore()
		}
	}
})

test(`records an unrelated unban by PlayFab without an action relation`, async () => {
	const calls: unknown[][] = []
	await unbanPlayer(
		{ playerId: 42, playfabId: `PLAYER_1`, playerName: `Alice` },
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
			playerName: `Alice`,
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
			players: [],
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
		fetchWanted: async () => null,
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
