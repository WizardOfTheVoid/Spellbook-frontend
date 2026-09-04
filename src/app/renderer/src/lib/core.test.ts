import assert from "node:assert/strict"
import test from "node:test"
import type { PlayerDbProfile, PlayerEntry } from "./core"
import * as core from "./core"
import { getPlayerKey } from "./core"

test("creates unique row keys for players with placeholder PlayFab IDs", () => {
	const first = player(0, "First")
	const second = player(1, "Second")

	assert.notEqual(getPlayerKey(first), getPlayerKey(second))
})

test(`models server variables and action safeguards on final response shapes`, () => {
	const variable: core.GameServerParam = {
		id: 1,
		gameServerId: 7,
		label: `Rules URL`,
		key: `rules_url`,
		value: `https://example.test/rules`,
		sortOrder: 3
	}
	const action = {
		label: `Escalate`,
		actionDomain: `player`,
		delayMs: 0,
		sortOrder: 0,
		isEnabled: true,
		iconKey: `gavel`,
		blockOnMissingVariables: true,
		commands: []
	} satisfies core.ServerProfileAction

	assert.equal(variable.gameServerId, 7)
	assert.equal(action.iconKey, `gavel`)
	assert.equal(action.blockOnMissingVariables, true)
})

test("models player history with action and author fields", () => {
	const profile = {
		actions: [{
			id: 9,
			playerId: 42,
			gameServerId: 3,
			authorId: 7,
			actionType: "unban",
			offenseType: null,
			duration: null,
			reason: null,
			scope: "local",
			relatedActionId: 8,
			autoban: false,
			originalActionId: null,
			expiresAt: null,
			createdAt: "2026-08-26T12:00:00.000Z",
			updatedAt: "2026-08-26T12:00:00.000Z",
			author: { id: 7, username: "Admin", playfabId: "ADMIN_1" },
			gameServer: { id: 3, name: "Duel", displayName: null }
		}]
	} satisfies Pick<PlayerDbProfile, "actions">

	assert.equal(profile.actions[0]?.author.username, "Admin")
	assert.equal(profile.actions[0]?.offenseType, null)
})

test(`models only persisted PlayFab profile fields`, () => {
	const playfab = {
		account: { accountCreatedAt: `2026-07-01T00:00:00.000Z` },
		statistics: {
			rank: 56,
			globalXp: 121000,
			playtimeTicks: 500,
			playtimeExTicks: 25,
			playtimeHours: 0.000566606619075,
			lastLoginAt: `2026-07-31T09:00:00.000Z`
		},
		freshness: { stale: false, refreshFailed: false }
	} satisfies core.PlayerPlayFabData

	assert.deepEqual(Object.keys(playfab.account), [`accountCreatedAt`])
	assert.deepEqual(Object.keys(playfab.statistics), [
		`rank`,
		`globalXp`,
		`playtimeTicks`,
		`playtimeExTicks`,
		`playtimeHours`,
		`lastLoginAt`
	])
})

test("extracts raw Core player names without accepting derived normalization", () => {
	const result = core.extractListPlayersData({
		ok: true,
		status: 200,
		statusText: "OK",
		data: {
			players: [{
				index: 0,
				name: "MΔGIC.",
				normalizedName: "MDGIC.",
				playfabId: "25F6D104A89A3070",
				rawLine: "raw",
			}],
		},
	})

	assert.equal(result.players[0]?.name, "MΔGIC.")
	assert.equal(Object.hasOwn(result.players[0] ?? {}, "normalizedName"), false)
})

test("keeps both tick actions visible without run history", () => {
	const tickActionSummaries = (core as typeof core & {
		tickActionSummaries?: (actions: []) => Array<{
			action: string
			status: string
			supportsPause: boolean
		}>
	}).tickActionSummaries
	const actions = tickActionSummaries?.([]) ?? []

	assert.deepEqual(actions.map(action => [action.action, action.status, action.supportsPause]), [
		["leaderboard", "idle", true],
		["servers", "idle", false],
	])
})

test("describes a forced tick action as an executing run", () => {
	const message = (core as typeof core & {
		tickActionControlMessage?: (label: string, type: "start") => string
	}).tickActionControlMessage

	assert.equal(message?.("Servers", "start"), "Executing Run: Servers")
})

test("shows average records per second beside processed tick records", () => {
	const value = (core as typeof core & {
		tickActionProcessedValue?: (
			processedRecords: number,
			durationMs: number,
			locale?: Intl.LocalesArgument,
		) => string
	}).tickActionProcessedValue

	assert.equal(value?.(3453, 6628, 'de'), "3.453 (~521 RPS)")
	assert.equal(value?.(3453, 0, 'de'), "3.453")
})

test("adapts tick-action polling to active work", () => {
	const pollDelay = (core as typeof core & {
		tickActionPollDelay?: (statuses: string[]) => number
	}).tickActionPollDelay

	assert.equal(pollDelay?.(["completed", "idle"]), 10_000)
	assert.equal(pollDelay?.(["completed", "running"]), 100)
})

test("spaces a returned log batch across its polling interval", () => {
	const batchDelay = (core as typeof core & {
		tickActionLogBatchDelay?: (pollMs: number, count: number) => number
	}).tickActionLogBatchDelay

	assert.equal(batchDelay?.(100, 4), 25)
	assert.equal(batchDelay?.(100, 5), 20)
})

test("combines warning and error log filters while All clears filtering", () => {
	const filterLogs = (core as typeof core & {
		filterTickActionLogs?: <T extends { level: string }>(logs: T[], levels: Set<string>) => T[]
	}).filterTickActionLogs
	const logs = [
		{ id: 3, level: "error" },
		{ id: 2, level: "warning" },
		{ id: 1, level: "general" },
	]

	assert.deepEqual(filterLogs?.(logs, new Set(["warning", "error"])), logs.slice(0, 2))
	assert.deepEqual(filterLogs?.(logs, new Set()), logs)
})

test("counts all loaded logs by filter level", () => {
	const countLogs = (core as typeof core & {
		tickActionLogCounts?: <T extends { level: string }>(logs: T[]) => Record<string, number>
	}).tickActionLogCounts
	const logs = [
		{ level: "general" },
		{ level: "warning" },
		{ level: "error" },
		{ level: "error" },
	]

	assert.deepEqual(countLogs?.(logs), {
		all: 4,
		general: 1,
		warning: 1,
		error: 2,
	})
})

test("keeps the rolling log window newest first without duplicates", () => {
	const mergeLogs = (core as typeof core & {
		mergeTickActionLogs?: <T extends { id: number }>(current: T[], incoming: T[], limit: number) => T[]
	}).mergeTickActionLogs
	const current = [{ id: 2 }, { id: 1 }]
	const incoming = [{ id: 4 }, { id: 3 }, { id: 2 }]

	assert.deepEqual(mergeLogs?.(current, incoming, 3), [{ id: 4 }, { id: 3 }, { id: 2 }])
})

test("caps the rolling log window at 30 entries by default", () => {
	const mergeLogs = (core as typeof core & {
		mergeTickActionLogs?: <T extends { id: number }>(current: T[], incoming: T[]) => T[]
	}).mergeTickActionLogs
	const result = mergeLogs?.([], Array.from({ length: 151 }, (_, index) => ({ id: index + 1 }))) ?? []

	assert.equal(result.length, 30)
	assert.equal(result[0]?.id, 151)
	assert.equal(result.at(-1)?.id, 122)
})

test("keeps cleared action logs hidden when the panel remounts", () => {
	const createClearState = (core as typeof core & {
		createTickActionLogClearState?: () => {
			clearedThrough: (runId: number) => number
			clearThrough: (runId: number, logId: number) => void
		}
	}).createTickActionLogClearState
	const clearState = createClearState?.()

	clearState?.clearThrough(41, 28)
	clearState?.clearThrough(41, 12)
	clearState?.clearThrough(42, 7)

	assert.equal(clearState?.clearedThrough(41), 28)
	assert.equal(clearState?.clearedThrough(42), 7)
	assert.equal(clearState?.clearedThrough(43), 0)
})

test("does not advance the log cursor for a request cleared while in flight", () => {
	const nextAfterId = (core as typeof core & {
		nextTickActionLogAfterId?: (
			currentAfterId: number,
			incoming: Array<{ id: number }>,
			requestedClearVersion: number,
			currentClearVersion: number
		) => number | null
	}).nextTickActionLogAfterId

	assert.equal(nextAfterId?.(30, [{ id: 31 }], 0, 1), null)
	assert.equal(nextAfterId?.(30, [{ id: 31 }], 1, 1), 31)
})

test("selects one overlay view while player details replace only player lists", () => {
	const resolveView = (core as typeof core & {
		resolveOverlayView?: (page: string, hasSelectedPlayer: boolean) => string
	}).resolveOverlayView

	assert.equal(resolveView?.("server", true), "player")
	assert.equal(resolveView?.("players", true), "player")
	assert.equal(resolveView?.("wanted", true), "wanted-player")
	assert.equal(resolveView?.("wanted", false), "wanted")
	assert.equal(resolveView?.("profiles", true), "profiles")
	assert.equal(resolveView?.("admin", false), "admin")
})

test("maps log severity to distinct UI sound cues", () => {
	const cue = (core as typeof core & {
		tickActionLogCue?: (level: string) => string
	}).tickActionLogCue

	assert.equal(cue?.("general"), "info")
	assert.equal(cue?.("warning"), "warning")
	assert.equal(cue?.("error"), "error")
})

function player(index: number, name: string): PlayerEntry {
	return {
		index,
		name,
		playfabId: "NULL",
		eosPlayerId: "-1621442496",
		rawLine: name,
	}
}
