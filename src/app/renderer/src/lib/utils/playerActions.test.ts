import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlayerAction } from '$lib/core'
import { formatOffenseType } from './formatOffenseType'
import {
	actionLabel,
	actionAuthorWithTeam,
	filterActionsByRange,
	formatActionDuration,
	formatActionHoursLeft,
	formatActionTooltip,
	isActionBanActive,
} from './playerActions'

const now = new Date(`2026-08-26T12:00:00.000Z`)

test(`offense formatting replaces underscores, title cases words, and preserves FFA`, () => {
	for (const [value, expected] of [
		[`ffa`, `FFA`], [`low_level`, `Low Level`], [`verbal_abuse`, `Verbal Abuse`],
		[`TOXIC_BEHAVIOR`, `Toxic Behavior`], [`  ffa_abuse  `, `FFA Abuse`],
		[`votekick_abuse`, `Votekick Abuse`], [``, `None`],
	]) assert.equal(formatOffenseType(value), expected)
	assert.equal(formatOffenseType(null), `None`)
	assert.equal(formatOffenseType(undefined), `None`)
})

test(`action labels use shared offense formatting`, () => {
	assert.equal(actionLabel(action({ offenseType: `ffa` })), `Ban: FFA`)
	assert.equal(actionLabel(action({ offenseType: `low_level` })), `Ban: Low Level`)
})

test(`credited authors show the stored team name and omit missing team credit`, () => {
	assert.equal(actionAuthorWithTeam(action({ creditedTeam: { id: 23, name: `Team Name` } })), `Moderator @ Team Name`)
	assert.equal(actionAuthorWithTeam(action({ creditedTeam: null })), `Moderator`)
	assert.equal(actionAuthorWithTeam(action()), `Moderator`)
	assert.equal(actionAuthorWithTeam(action({ creditedTeam: { id: 23, name: ` ` } })), `Moderator`)
})

test(`action ranges default to all time and preserve action order`, () => {
	const actions = [action(), action({ id: 10, createdAt: `2020-01-01T00:00:00.000Z` })]
	assert.deepEqual(filterActionsByRange(actions), actions)
	assert.deepEqual(filterActionsByRange(actions, `all`, now), actions)
})

test(`action ranges include the cutoff and exclude older or undated actions`, () => {
	for (const range of [`30`, `90`]) {
		const cutoff = now.getTime() - Number(range) * 24 * 60 * 60 * 1000
		const actions = [
			action(),
			action({ id: 10, createdAt: new Date(cutoff).toISOString() }),
			action({ id: 11, createdAt: new Date(cutoff - 1).toISOString() }),
			action({ id: 12, createdAt: `invalid` }),
		]
		assert.deepEqual(filterActionsByRange(actions, range, now).map(item => item.id), [9, 10])
		assert.equal(actions.length, 4)
	}
})

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

test(`action tooltips show type, served hours, author, and server in order`, () => {
	assert.equal(
		formatActionTooltip(action({ duration: 24 }), [], now),
		`Type: ban\nDuration: 2/24 hours\nAuthor: Moderator\nServer: Long server name`,
	)
})

test(`served hours stop at expiry or the earliest related unban`, () => {
	const ban = action({ duration: 24 })
	const unban = action({ id: 10, actionType: `unban`, relatedActionId: ban.id, createdAt: `2026-08-26T11:00:00.000Z` })
	assert.match(formatActionTooltip(ban, [unban], now), /Duration: 1\/24 hours/u)
	assert.match(formatActionTooltip(ban, [{ ...unban, relatedActionId: 99 }], now), /Duration: 2\/24 hours/u)
	assert.match(formatActionTooltip(action({ duration: 1 }), [], now), /Duration: 1\/1 hours/u)
	assert.match(formatActionTooltip(action({ duration: 24, expiresAt: unban.createdAt }), [], now), /Duration: 1\/24 hours/u)
})

test(`tooltips handle permanent bans, future bans, and non-ban actions`, () => {
	assert.match(formatActionTooltip(action(), [], now), /Duration: 2 hours \/ Permanent/u)
	assert.match(formatActionTooltip(action({ duration: 24, createdAt: `2026-08-27T10:00:00.000Z` }), [], now), /Duration: 0\/24 hours/u)
	for (const actionType of [`kick`, `unban`] as const) {
		assert.match(formatActionTooltip(action({ actionType }), [], now), new RegExp(`Type: ${actionType}\nDuration: None\nAuthor:`, `u`))
	}
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
