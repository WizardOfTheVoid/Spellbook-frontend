import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoreCallResult, WantedCreateInput } from '$lib/core'
import {
	createWantedPlayer,
	getWantedPlayer,
	parseWantedDetail,
	removeWantedPlayer,
	revertWantedPlayer,
} from './wantedActionsApi'

test(`maps Wanted mutations through the focused bridge and strictly parses returned detail`, async () => {
	const calls: unknown[][] = []
	const detail = wantedDetail()
	const restore = installWantedApi({
		get: async playerId => {
			calls.push([`get`, playerId])
			return result(detail)
		},
		create: async input => {
			calls.push([`create`, input])
			return result(detail, 201)
		},
		revert: async (playerId, sourceActionId) => {
			calls.push([`revert`, playerId, sourceActionId])
			return result({ ...detail, sourceAction: action({ id: 10, actionType: `unban`, relatedActionId: 9 }) }, 201)
		},
		remove: async playerId => {
			calls.push([`remove`, playerId])
			return result(null, 204)
		},
	})

	try {
		assert.deepEqual(await getWantedPlayer(42), {
			...detail,
			player: {
				...detail.player,
				lastLogin: null,
				playtimeHours: null,
				activeBanKind: null,
			},
		})
		assert.equal((await createWantedPlayer({ playfabId: `P1`, mock: true })).wanted.id, 4)
		assert.equal((await revertWantedPlayer(42, 9)).sourceAction?.actionType, `unban`)
		await removeWantedPlayer(42)
		assert.deepEqual(calls, [
			[`get`, 42],
			[`create`, { playfabId: `P1`, mock: true }],
			[`revert`, 42, 9],
			[`remove`, 42],
		])
	} finally {
		restore()
	}
})

test(`preserves an explicit detail 404 as inactive while other failures throw`, async () => {
	let response = failure(404, `WANTED_NOT_FOUND`, `Player is not currently Wanted.`)
	const restore = installWantedApi({ get: async () => response })

	try {
		assert.equal(await getWantedPlayer(42), null)
		response = failure(401, `AUTH_REQUIRED`, `Session expired.`)
		await assert.rejects(() => getWantedPlayer(42), /Session expired\./)
	} finally {
		restore()
	}
})

test(`rejects malformed detail actions instead of losing lineage`, () => {
	const detail = wantedDetail()
	assert.throws(
		() => parseWantedDetail({
			...detail,
			targetActions: [{ ...action(), originalActionId: undefined }],
		}),
		/Invalid wanted detail data\./,
	)
	assert.throws(
		() => parseWantedDetail({ ...detail, canRemove: `true` }),
		/Invalid wanted detail data\./,
	)
})

type WantedApi = {
	get: (playerId: number) => Promise<CoreCallResult>
	create: (input: WantedCreateInput) => Promise<CoreCallResult>
	revert: (playerId: number, sourceActionId: number) => Promise<CoreCallResult>
	remove: (playerId: number) => Promise<CoreCallResult>
}

function installWantedApi(overrides: Partial<WantedApi>): () => void {
	const original = Object.getOwnPropertyDescriptor(globalThis, `window`)
	const api: WantedApi = {
		get: async () => result(wantedDetail()),
		create: async () => result(wantedDetail(), 201),
		revert: async () => result(wantedDetail(), 201),
		remove: async () => result(null, 204),
		...overrides,
	}
	Object.defineProperty(globalThis, `window`, {
		configurable: true,
		value: { chivServer: { wanted: api } },
	})
	return () => {
		if (original) Object.defineProperty(globalThis, `window`, original)
		else delete (globalThis as { window?: unknown }).window
	}
}

function wantedDetail() {
	return {
		wanted: { id: 4, playerId: 42, originalActionId: 9, deletedAt: null },
		player: {
			id: 42,
			playfabId: `P1`,
			latestName: `Alice`,
			latestNormalizedName: `alice`,
			isOnline: false,
			lastSeen: `2026-08-31T11:00:00.000Z`,
			createdAt: `2026-08-01T00:00:00.000Z`,
			updatedAt: `2026-08-31T11:00:00.000Z`,
		},
		sourceAction: action(),
		automaticActions: [],
		targetActions: [action()],
		targetServerIds: [7],
		noteCount: 3,
		canRevert: true,
		canRemove: false,
	}
}

function action(overrides: Record<string, unknown> = {}) {
	return {
		id: 9,
		playerId: 42,
		gameServerId: 7,
		authorId: 3,
		actionType: `ban`,
		offenseType: `hacker`,
		duration: null,
		reason: `Evidence`,
		scope: `global`,
		relatedActionId: null,
		autoban: false,
		creationType: `auto`,
		originalActionId: null,
		expiresAt: null,
		createdAt: `2026-08-31T10:00:00.000Z`,
		updatedAt: `2026-08-31T10:00:00.000Z`,
		author: { id: 3, username: `Admin`, playfabId: `ADMIN_1` },
		gameServer: { id: 7, name: `Duel`, displayName: null },
		...overrides,
	}
}

function result(data: unknown, status = 200): CoreCallResult {
	return { ok: true, status, statusText: `OK`, data: { ok: true, data } }
}

function failure(status: number, code: string, message: string): CoreCallResult {
	return {
		ok: false,
		status,
		statusText: `Error`,
		data: { ok: false, error: { code, message } },
	}
}
