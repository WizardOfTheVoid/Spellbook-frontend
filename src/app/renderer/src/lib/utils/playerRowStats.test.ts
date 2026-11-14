import assert from 'node:assert/strict'
import test from 'node:test'
import { createPlayerRowStats } from './playerRowStats.js'

test(`builds the live row stats with kills only and distinct icon tones`, () => {
	assert.deepEqual(
		createPlayerRowStats({
			kills: 24,
			deaths: 5,
			rank: 454,
			pingMs: 32,
			playtimeHours: null,
			lastLogin: null,
		}, `live`).slice(0, 3),
		[
			{
				id: `kills`,
				icon: `fa-swords`,
				label: `Kills`,
				value: `24`,
				iconColor: `var(--color-accent-secondary)`,
			},
			{
				id: `rank`,
				icon: `fa-ranking-star`,
				label: `Rank`,
				value: `454`,
				iconColor: `var(--color-accent-primary)`,
			},
			{
				id: `ping`,
				icon: `fa-signal`,
				label: `Ping`,
				value: `32 ms`,
				iconColor: `var(--color-accent-tertiary)`,
			},
		],
	)
})

test(`shows last login only in database player rows`, () => {
	const player = {
		kills: 24,
		deaths: 5,
		rank: 454,
		pingMs: 32,
		playtimeHours: 120,
		lastLogin: `2026-08-29T10:00:00.000Z`,
	}

	assert.deepEqual(
		createPlayerRowStats(player, `live`).map(({ id }) => id),
		[`kills`, `rank`, `ping`, `playtime`],
	)
	assert.deepEqual(
		createPlayerRowStats(player, `database`).map(({ id }) => id),
		[`rank`, `playtime`, `lastLogin`],
	)
})
