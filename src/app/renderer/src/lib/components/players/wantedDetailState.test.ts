import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlayerAction, WantedDetail } from '$lib/core'
import { createWantedDetailController } from './wantedDetailState'

test(`ignores old player and session loads while preserving the selected context`, async () => {
	const first = deferred<WantedDetail | null>()
	const second = deferred<WantedDetail | null>()
	const loads = [first.promise, second.promise]
	const controller = createWantedDetailController({
		load: async () => await loads.shift()!,
		revert: async () => detail(99),
		remove: async () => {},
	})

	const oldLoad = controller.select({ playerId: 11, sessionRevision: 1 })
	const currentLoad = controller.select({ playerId: 12, sessionRevision: 2 })
	first.resolve(detail(5, 11))
	await oldLoad
	assert.equal(controller.snapshot().detail, null)

	second.resolve(detail(8, 12))
	await currentLoad
	assert.equal(controller.snapshot().detail?.wanted.playerId, 12)
	assert.equal(controller.snapshot().detail?.sourceAction?.id, 8)
})

test(`treats 404 as inactive and retains last-good detail through retryable errors`, async () => {
	let response: WantedDetail | null | Error = detail(5)
	const controller = createWantedDetailController({
		load: async () => {
			if (response instanceof Error) throw response
			return response
		},
		revert: async () => detail(99),
		remove: async () => {},
	})

	await controller.select({ playerId: 11, sessionRevision: 1 })
	response = new Error(`Server unavailable`)
	await controller.refresh()
	assert.equal(controller.snapshot().detail?.sourceAction?.id, 5)
	assert.equal(controller.snapshot().error, `Server unavailable`)

	response = detail(6)
	await controller.refresh()
	assert.equal(controller.snapshot().detail?.sourceAction?.id, 6)
	assert.equal(controller.snapshot().error, null)

	response = null
	await controller.refresh()
	assert.equal(controller.snapshot().detail, null)
	assert.equal(controller.snapshot().inactive, true)
})

test(`applies only current revert and remove mutations`, async () => {
	const pendingRevert = deferred<WantedDetail>()
	let removed = 0
	const controller = createWantedDetailController({
		load: async playerId => detail(playerId === 11 ? 5 : 8, playerId),
		revert: async () => await pendingRevert.promise,
		remove: async () => { removed += 1 },
	})

	await controller.select({ playerId: 11, sessionRevision: 1 })
	const staleRevert = controller.revert(5)
	await controller.select({ playerId: 12, sessionRevision: 2 })
	pendingRevert.resolve(detail(10, 11, `unban`))
	assert.deepEqual(await staleRevert, { status: `stale` })
	assert.equal(controller.snapshot().detail?.wanted.playerId, 12)

	assert.deepEqual(await controller.remove(), { status: `applied` })
	assert.equal(removed, 1)
	assert.equal(controller.snapshot().inactive, true)
})

test(`returns the captured mutation outcome instead of a newer context error`, async () => {
	const pendingRevert = deferred<WantedDetail>()
	let failCurrentLoad = false
	const controller = createWantedDetailController({
		load: async playerId => {
			if (failCurrentLoad) throw new Error(`New context failed`)
			return detail(playerId === 11 ? 5 : 8, playerId)
		},
		revert: async () => await pendingRevert.promise,
		remove: async () => {},
	})

	await controller.select({ playerId: 11, sessionRevision: 1 })
	const staleRevert = controller.revert(5)
	await controller.select({ playerId: 12, sessionRevision: 2 })
	failCurrentLoad = true
	await controller.refresh()
	pendingRevert.resolve(detail(10, 11, `unban`))

	assert.deepEqual(await staleRevert, { status: `stale` })
	assert.equal(controller.snapshot().error, `New context failed`)
})

test(`removes legacy wanted rows without a source action`, async () => {
	let removed = 0
	const legacy = detail(5)
	legacy.wanted.originalActionId = null
	legacy.sourceAction = null
	legacy.targetActions = []
	legacy.targetServerIds = []
	legacy.canRevert = false
	const controller = createWantedDetailController({
		load: async () => legacy,
		revert: async () => detail(99),
		remove: async () => { removed += 1 },
	})

	await controller.select({ playerId: 11, sessionRevision: 1 })
	assert.deepEqual(await controller.remove(), { status: `applied` })
	assert.equal(removed, 1)
	assert.equal(controller.snapshot().inactive, true)
})

function detail(
	sourceId: number,
	playerId = 11,
	actionType: PlayerAction[`actionType`] = `ban`,
): WantedDetail {
	const source = action(sourceId, playerId, actionType)
	return {
		wanted: { id: 21, playerId, originalActionId: sourceId, deletedAt: null },
		player: {
			id: playerId,
			playfabId: `PLAYER_${playerId}`,
			latestName: `Player ${playerId}`,
			latestNormalizedName: `player ${playerId}`,
			lastLogin: null,
			playtimeHours: null,
			activeBanKind: actionType === `ban` ? `hacker` : null,
			isOnline: false,
			lastSeen: null,
			createdAt: `2026-08-31T00:00:00.000Z`,
			updatedAt: `2026-08-31T00:00:00.000Z`,
		},
		sourceAction: source,
		automaticActions: [],
		targetActions: actionType === `mock` ? [] : [source],
		targetServerIds: actionType === `mock` ? [] : [13],
		noteCount: 3,
		canRevert: actionType === `ban`,
		canRemove: true,
	}
}

function action(id: number, playerId: number, actionType: PlayerAction[`actionType`]): PlayerAction {
	return {
		id,
		playerId,
		gameServerId: 13,
		authorId: 7,
		actionType,
		offenseType: actionType === `ban` || actionType === `mock` ? `hacker` : null,
		duration: null,
		reason: `Reason`,
		scope: `global`,
		relatedActionId: actionType === `unban` ? 5 : null,
		autoban: false,
		originalActionId: null,
		expiresAt: null,
		createdAt: `2026-08-31T00:00:00.000Z`,
		updatedAt: `2026-08-31T00:00:00.000Z`,
		author: { id: 7, username: `Admin`, playfabId: null },
		gameServer: { id: 13, name: `Server`, displayName: `Origin` },
	}
}

function deferred<T>() {
	let resolve!: (value: T) => void
	const promise = new Promise<T>(next => { resolve = next })
	return { promise, resolve }
}
