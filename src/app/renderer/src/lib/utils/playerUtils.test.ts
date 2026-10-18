import assert from 'node:assert/strict'
import test from 'node:test'
import * as playerUtils from './playerUtils.js'
import { formatDateStamp, formatFullDateStamp } from '@spellbook/shared/dateFormatting'

const proposed = playerUtils as typeof playerUtils & {
	formatCompactHours?: (value: number | null | undefined) => string
	formatFullDateTime?: (value: string | null | undefined) => string
	formatHours?: (value: number | null | undefined) => string
	formatRelativeDateTime?: (
		value: string | null | undefined,
		now?: Date,
	) => string
	isPlayerOnline?: (player: { isOnline: boolean }) => boolean
	shouldShowPlayerOnlineIndicator?: (
		player: { isOnline: boolean },
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

test('formats date stamps in the selected timezone across a day boundary', () => {
	const value = '2026-09-25T23:30:00.000Z'
	assert.equal(formatDateStamp(value, 'date', 'UTC', 'en-US'), 'September 25, 2026')
	assert.equal(formatDateStamp(value, 'date', 'Europe/Oslo', 'en-US'), 'September 26, 2026')
	assert.equal(formatDateStamp(value, 'dateTime', 'Europe/Oslo', 'en-US'), 'Sep 26, 2026, 1:30 AM')
	assert.equal(formatDateStamp(value, 'time', 'Europe/Oslo', 'en-US'), '01:30')
	assert.equal(formatDateStamp('2026-09-25T09:00:00.000Z', 'time', 'Europe/Oslo', 'en-US'), '11:00')
	assert.match(formatFullDateStamp(value, 'Europe/Oslo', 'en-US'), /September 26, 2026.*1:30/u)
	assert.equal(formatDateStamp('invalid', 'dateTime', 'UTC', 'en-US'), '—')
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

test('uses global presence even without a local live player snapshot', () => {
	const remotePlayer = { isOnline: true, livePlayer: null }
	assert.equal(proposed.isPlayerOnline?.(remotePlayer), true)
	assert.equal(proposed.isPlayerOnline?.({ isOnline: false }), false)
})

test('shows online presence only on database player rows', () => {
	const onlinePlayer = { isOnline: true, livePlayer: null }

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
