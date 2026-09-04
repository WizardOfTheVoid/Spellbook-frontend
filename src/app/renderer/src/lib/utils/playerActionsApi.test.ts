import assert from 'node:assert/strict'
import test from 'node:test'
import type {
	CoreCallResult,
	PlayerAction,
} from '$lib/core'
import {
	fetchAllPlayerActions,
	parsePlayerAction,
} from './playerActionsApi'

test(`loads every player action page through normal API envelopes`, async () => {
	const calls: Array<[number, number, number]> = []
	const actions = Array.from({ length: 201 }, (_, index) => action(index + 1))
	const api = installApi({
		listActions: async (playerId, limit, offset) => {
			calls.push([playerId, limit, offset])
			return result(actions.slice(offset, offset + limit))
		},
	})

	try {
		assert.deepEqual(await fetchAllPlayerActions(42), actions)
		assert.deepEqual(calls, [[42, 200, 0], [42, 200, 200]])
	} finally {
		api.restore()
	}
})

test(`parses mock lineage through the shared strict player-action parser`, () => {
	const mock = action(9)
	const parsed = parsePlayerAction({
		...mock,
		actionType: `mock`,
		originalActionId: 7,
	})

	assert.equal(parsed.actionType, `mock`)
	assert.equal(parsed.originalActionId, 7)
	for (const invalid of [
		{ ...mock, actionType: `dance` },
		Object.fromEntries(Object.entries(mock).filter(([key]) => key !== `originalActionId`)),
		{ ...mock, autoban: `false` },
	]) {
		assert.throws(() => parsePlayerAction(invalid), /Invalid player action data\./)
	}
})

type ApiOptions = {
	listActions?: (playerId: number, limit: number, offset: number) => Promise<CoreCallResult>
}

function installApi(options: ApiOptions): { restore: () => void } {
	const originalWindow = Object.getOwnPropertyDescriptor(globalThis, `window`)
	Object.defineProperty(globalThis, `window`, {
		configurable: true,
		value: {
			chivServer: {
				playerActions: {
					list: options.listActions ?? (async () => result([])),
				},
			},
		},
	})

	return {
		restore: () => {
			if (originalWindow) Object.defineProperty(globalThis, `window`, originalWindow)
			else delete (globalThis as { window?: unknown }).window
		},
	}
}

function action(id: number): PlayerAction {
	return {
		id,
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
		createdAt: `2026-08-26T12:00:00.000Z`,
		updatedAt: `2026-08-26T12:00:00.000Z`,
		author: { id: 3, username: `Admin`, playfabId: `ADMIN_1` },
		gameServer: { id: 7, name: `Duel`, displayName: null },
	}
}

function result<T>(data: T): CoreCallResult {
	return { ok: true, status: 200, statusText: `OK`, data: { ok: true, data } }
}
