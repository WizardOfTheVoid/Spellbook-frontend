import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlayerAction } from '$lib/core'
import {
	actionLabel,
	formatActionDuration,
	formatActionHoursLeft,
	formatActionTooltip,
	isActionBanActive,
} from './playerActions'

const now = new Date(`2026-08-26T12:00:00.000Z`)

test(`formats permanent bans and unbans without an offense`, () => {
	assert.equal(formatActionDuration(action({ duration: null })), `Permanent`)
	assert.equal(actionLabel(action({ actionType: `unban`, offenseType: null })), `Unban`)
})

test(`formats the whole hours left for permanent, current, and expired bans`, () => {
	assert.equal(formatActionHoursLeft(action({ duration: null }), now), `Permanent`)
	assert.equal(
		formatActionHoursLeft(
			action({ duration: 24, expiresAt: `2026-08-26T14:01:00.000Z` }),
			now,
		),
		`3 hours`,
	)
	assert.equal(
		formatActionHoursLeft(
			action({ duration: 3, createdAt: `2026-08-26T10:00:00.000Z` }),
			new Date(`2026-08-26T12:15:00.000Z`),
		),
		`1 hour`,
	)
	assert.equal(
		formatActionHoursLeft(
			action({ duration: 1, expiresAt: `2026-08-26T11:59:59.000Z` }),
			now,
		),
		`Expired`,
	)
})

test(`includes the resolved author in action tooltips`, () => {
	assert.equal(
		formatActionTooltip(action({ duration: 24 })),
		`Server: Long server name\nAdmin: Moderator\nDuration: 24 hours`,
	)
})

test(`keeps current permanent bans active`, () => {
	const ban = action({ duration: null })

	assert.equal(isActionBanActive(ban, [ban], now), true)
})

test(`expires timed bans from stored or calculated expiry`, () => {
	const storedExpiry = action({ duration: 24, expiresAt: `2026-08-26T11:59:59.000Z` })
	const calculatedExpiry = action({ duration: 1, createdAt: `2026-08-26T10:00:00.000Z`, expiresAt: null })

	assert.equal(isActionBanActive(storedExpiry, [storedExpiry], now), false)
	assert.equal(isActionBanActive(calculatedExpiry, [calculatedExpiry], now), false)
})

test(`rejects bans created in the future`, () => {
	const ban = action({ duration: null, createdAt: `2026-08-26T12:00:01.000Z` })

	assert.equal(isActionBanActive(ban, [ban], now), false)
})

test(`closes only the ban referenced by a related unban`, () => {
	const ban = action()
	const relatedUnban = action({ id: 10, actionType: `unban`, offenseType: null, relatedActionId: ban.id })
	const unrelatedUnban = action({ id: 11, actionType: `unban`, offenseType: null, relatedActionId: null })

	assert.equal(isActionBanActive(ban, [ban, unrelatedUnban], now), true)
	assert.equal(isActionBanActive(ban, [ban, unrelatedUnban, relatedUnban], now), false)
})

function action(overrides: Partial<PlayerAction> = {}): PlayerAction {
	return {
		id: 9,
		playerId: 42,
		gameServerId: 10,
		authorId: 7,
		actionType: `ban`,
		offenseType: `hacker`,
		duration: null,
		reason: `Evidence`,
		scope: `global`,
		relatedActionId: null,
		autoban: false,
		originalActionId: null,
		expiresAt: null,
		createdAt: `2026-08-26T10:00:00.000Z`,
		updatedAt: `2026-08-26T10:00:00.000Z`,
		author: { id: 7, username: `Moderator`, playfabId: `ADMIN-PF` },
		gameServer: { id: 10, name: `Long server name`, displayName: null },
		...overrides,
	}
}
