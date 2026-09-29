import type { PlayerState } from '$lib/types/playerState'
import {
	formatCompactHours,
	formatFullDateTime,
	formatMetric,
	formatShortRelativeDateTime,
} from './playerUtils'

export type PlayerRowStat = {
	id: 'kills' | 'rank' | 'ping' | 'playtime' | 'lastLogin'
	icon: string
	label: string
	value: string
	iconColor: string
}

type PlayerRowMetrics = Pick<
	PlayerState,
	'kills' | 'deaths' | 'rank' | 'pingMs' | 'playtimeHours' | 'lastLogin'
>

export function createPlayerRowStats(
	player: PlayerRowMetrics,
	mode: 'database' | 'live',
): PlayerRowStat[] {
	const stats: PlayerRowStat[] = []

	if (mode === `live`) {
		stats.push({
			id: `kills`,
			icon: `fa-swords`,
			label: `Kills`,
			value: formatMetric(player.kills),
			iconColor: `var(--color-accent-secondary)`,
		})
	}

	stats.push({
		id: `rank`,
		icon: `fa-ranking-star`,
		label: `Rank`,
		value: formatMetric(player.rank),
		iconColor: `var(--color-accent-primary)`,
	})

	if (mode === `live`) {
		stats.push({
			id: `ping`,
			icon: `fa-signal`,
			label: `Ping`,
			value: `${formatMetric(player.pingMs)} ms`,
			iconColor: `var(--color-accent-tertiary)`,
		})
	}

	stats.push({
		id: `playtime`,
		icon: `fa-hourglass-half`,
		label: `Playtime`,
		value: formatCompactHours(player.playtimeHours),
		iconColor: `var(--color-accent-secondary)`,
	})

	if (mode === `database`) {
		stats.push({
			id: `lastLogin`,
			icon: `fa-clock`,
			label: player.lastLogin
				? formatFullDateTime(player.lastLogin)
				: `Last login unavailable`,
			value: player.lastLogin
				? formatShortRelativeDateTime(player.lastLogin)
				: `--`,
			iconColor: `var(--color-accent-secondary)`,
		})
	}

	return stats
}
