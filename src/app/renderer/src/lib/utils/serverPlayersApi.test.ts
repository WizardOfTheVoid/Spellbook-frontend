import assert from "node:assert/strict"
import test from "node:test"
import type { CurrentGameSnapshot } from "$lib/core"

test(`detects Hastings with no players as the game main menu`, async () => {
	const isGameMainMenu = await loadIsGameMainMenu()

	assert.equal(isGameMainMenu(`Hastings`, 0), true)
	assert.equal(isGameMainMenu(` hastings `, 0), true)
	assert.equal(isGameMainMenu(`Hastings`, 1), false)
	assert.equal(isGameMainMenu(`Arena`, 0), false)
})

test(`preserves an unavailable current Main snapshot for the server panel`, async () => {
	const calls = setCoreSnapshot(null)
	const modulePath = `./serverPlayersApi`
	const module = await import(modulePath)
	const isGameNotRunningError = Reflect.get(module, `isGameNotRunningError`)

	assert.equal(
		typeof isGameNotRunningError,
		`function`,
		`isGameNotRunningError should be implemented`,
	)

	await assert.rejects(
		module.fetchServerPlayers(),
		(error: unknown) => isGameNotRunningError(error),
	)
	assert.deepEqual(calls, [`currentGameSnapshot`])
})

test(`reads the Server-resolved external ID and exact player names from the current snapshot`, async () => {
	const calls = setCoreSnapshot(snapshot(`lobby-44`, `  Exact  Player  `))
	const modulePath = `./serverPlayersApi`
	const module = await import(modulePath)

	const result = await module.fetchServerPlayers()

	assert.equal(result.externalId, `lobby-44`)
	assert.equal(result.players[0]?.name, `  Exact  Player  `)
	assert.deepEqual(calls, [`currentGameSnapshot`])
})

async function loadIsGameMainMenu(): Promise<(serverRawName: string, playerCount: number) => boolean> {
	const modulePath = `./serverPlayersApi`
	const module = await import(modulePath).catch(() => ({}))
	const isGameMainMenu = Reflect.get(module, `isGameMainMenu`)

	assert.equal(typeof isGameMainMenu, `function`, `isGameMainMenu should be implemented`)
	return isGameMainMenu as (serverRawName: string, playerCount: number) => boolean
}

function setCoreSnapshot(snapshot: CurrentGameSnapshot | null): string[] {
	const calls: string[] = []
	Object.defineProperty(globalThis, `window`, {
		configurable: true,
		value: {
			chivCore: {
				currentGameSnapshot: async () => {
					calls.push(`currentGameSnapshot`)
					return snapshot
				},
				listPlayers: async () => { throw new Error(`renderer ListPlayers is forbidden`) },
				refreshCurrentGameSnapshot: async () => { throw new Error(`renderer refresh is forbidden`) },
			}
		},
	})
	return calls
}

function snapshot(externalId: string, name: string): CurrentGameSnapshot {
	return {
		version: 9,
		observedAt: `2026-08-31T10:00:00.000Z`,
		gameServerId: 44,
		externalId,
		serverName: `Arena`,
		serverAddress: `127.0.0.1:7777`,
		players: [{ index: 1, name, playfabId: `PF-1`, rawLine: name }],
		parseWarnings: []
	}
}
