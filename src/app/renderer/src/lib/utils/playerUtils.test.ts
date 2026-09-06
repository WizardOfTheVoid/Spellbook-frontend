import assert from 'node:assert/strict'
import test from 'node:test'
import * as playerUtils from './playerUtils.js'

const proposed = playerUtils as typeof playerUtils & {
	formatCompactHours?: (value: number | null | undefined) => string
	formatFullDateTime?: (value: string | null | undefined) => string
	formatHours?: (value: number | null | undefined) => string
	formatRelativeDateTime?: (
		value: string | null | undefined,
		now?: Date,
	) => string
	isPlayerOnline?: (player: { livePlayer: unknown | null }) => boolean
	shouldShowPlayerOnlineIndicator?: (
		player: { livePlayer: unknown | null },
		mode: 'database' | 'live',
	) => boolean
	playerBanOutlineTone?: (
		kind: 'hacker' | 'other' | null,
	) => 'danger' | 'warning' | null
}

test('formats PlayFab dates with the year and a missing-value fallback', () => {
	assert.equal(proposed.formatFullDateTime?.(null), '--')
	assert.match(proposed.formatFullDateTime?.('2026-07-31T09:00:00.000Z') ?? '', /2026/u)
})

test('formats PlayFab playtime as one-decimal hours', () => {
	assert.equal(proposed.formatHours?.(null), '--')
	assert.equal(proposed.formatHours?.(12.34), '12.3 hours')
})

test('formats cached playtime as compact rounded hours', () => {
	assert.equal(proposed.formatCompactHours?.(499.6), '500h')
	assert.equal(proposed.formatCompactHours?.(0.4), '0h')
	assert.equal(proposed.formatCompactHours?.(null), '--')
})

test('uses the live player snapshot for presence', () => {
	assert.equal(proposed.isPlayerOnline?.({ livePlayer: { playfabId: 'P1' } }), true)
	assert.equal(proposed.isPlayerOnline?.({ livePlayer: null }), false)
})

test('shows online presence only on database player rows', () => {
	const onlinePlayer = { livePlayer: { playfabId: 'P1' } }

	assert.equal(proposed.shouldShowPlayerOnlineIndicator?.(onlinePlayer, 'database'), true)
	assert.equal(proposed.shouldShowPlayerOnlineIndicator?.(onlinePlayer, 'live'), false)
})

test('maps active ban kinds to row outline tones', () => {
	assert.equal(proposed.playerBanOutlineTone?.('hacker'), 'danger')
	assert.equal(proposed.playerBanOutlineTone?.('other'), 'warning')
	assert.equal(proposed.playerBanOutlineTone?.(null), null)
})

test('formats PlayFab last login as relative time', () => {
	const now = new Date('2026-07-31T12:00:00.000Z')

	assert.equal(
		playerUtils.formatRelativeDateTime('2026-07-29T12:00:00.000Z', now, 'long', 'en'),
		'2 days ago',
	)
	assert.equal(
		playerUtils.formatRelativeDateTime('2026-07-17T12:00:00.000Z', now, 'long', 'en'),
		'2 weeks ago',
	)
	assert.equal(proposed.formatRelativeDateTime?.(null, now), '--')
})

test('uses the system locale when no relative-time locale is supplied', () => {
	const originalRelativeTimeFormat = Intl.RelativeTimeFormat
	const relativeTimeFormatDescriptor = Object.getOwnPropertyDescriptor(Intl, 'RelativeTimeFormat')
	let receivedLocales: Intl.LocalesArgument | undefined

	Object.defineProperty(Intl, 'RelativeTimeFormat', {
		...relativeTimeFormatDescriptor,
		value: class extends originalRelativeTimeFormat {
			constructor(locales?: Intl.LocalesArgument, options?: Intl.RelativeTimeFormatOptions) {
				receivedLocales = locales
				super('en', options)
			}
		},
	})

	try {
		proposed.formatRelativeDateTime?.(
			'2026-07-29T12:00:00.000Z',
			new Date('2026-07-31T12:00:00.000Z'),
		)
		assert.deepEqual(receivedLocales, [])
	} finally {
		if (relativeTimeFormatDescriptor) {
			Object.defineProperty(Intl, 'RelativeTimeFormat', relativeTimeFormatDescriptor)
		}
	}
})
