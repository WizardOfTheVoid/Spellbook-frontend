import type { DashboardRecentAction, DashboardSnapshot } from '$lib/core'
import { formatShortRelativeDateTime } from '$lib/utils/playerUtils'

const actionPresentation = {
  ban: { label: `Ban`, icon: `fa-ban` },
  kick: { label: `Kick`, icon: `fa-person-walking-arrow-right` },
  warn: { label: `Warning`, icon: `fa-triangle-exclamation` },
  mute: { label: `Mute`, icon: `fa-volume-xmark` },
  unban: { label: `Unban`, icon: `fa-unlock` },
} as const

const hourMs = 60 * 60 * 1000

function titleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll(`_`, ` `)
}

function presentTrend<T extends { trendPercent: number | null }>(entry: T) {
  return {
    ...entry,
    trend: entry.trendPercent === null
      ? `New`
      : `${entry.trendPercent > 0 ? `+` : ``}${entry.trendPercent}%`,
  }
}

function presentBanDuration(action: DashboardRecentAction, now: Date) {
  if (action.actionType !== `ban`) return { durationLabel: null, durationTooltip: null }
  if (action.duration === null) {
    return { durationLabel: `Permanent`, durationTooltip: `This ban does not expire.` }
  }

  const startedAt = new Date(action.createdAt).getTime()
  const endsAt = [
    now.getTime(),
    action.expiresAt ? new Date(action.expiresAt).getTime() : startedAt + action.duration * hourMs,
    action.unbannedAt ? new Date(action.unbannedAt).getTime() : Number.POSITIVE_INFINITY,
  ]
  const served = Math.min(action.duration, Math.max(0, Math.floor((Math.min(...endsAt) - startedAt) / hourMs)))
  return {
    durationLabel: `${served}/${action.duration} hrs`,
    durationTooltip: `${served} ${served === 1 ? `hour` : `hours`} served of ${action.duration}.`,
  }
}

function presentAction(action: DashboardRecentAction, now: Date, locale?: Intl.LocalesArgument) {
  const presentation = actionPresentation[action.actionType]
  const label = action.actionType === `ban` && action.offenseType
    ? titleCase(action.offenseType)
    : presentation.label
  return {
    ...action,
    icon: presentation.icon,
    player: action.playerName || `Player #${action.playerId}`,
    subtitle: `${label} · ${titleCase(action.scope)}`,
    scopeLabel: titleCase(action.scope),
    scopeIcon: action.scope === `global` ? `fa-earth-americas` : `fa-location-dot`,
    ...presentBanDuration(action, now),
    time: formatShortRelativeDateTime(action.createdAt, now, locale),
  }
}

export function createDashboardPresentation(
  snapshot: DashboardSnapshot,
  now = new Date(),
  locale?: Intl.LocalesArgument,
) {
  const day = new Intl.DateTimeFormat(locale, {
    month: `short`,
    day: `numeric`,
    timeZone: `UTC`,
  })
  const maximum = Math.max(1, ...snapshot.latestActions.buckets)
  return {
    ...snapshot,
    labels: snapshot.timeline.bucketStarts.map(value => day.format(new Date(value))),
    generatedAt: formatShortRelativeDateTime(snapshot.generatedAt, now, locale),
    localBanWidth: snapshot.yourBans.total === 0
      ? 0
      : snapshot.yourBans.local / snapshot.yourBans.total * 100,
    latestBarHeights: snapshot.latestActions.buckets.map(value => `${Math.round(value / maximum * 100)}%`),
    leaderboards: {
      individuals: snapshot.leaderboards.individuals.map(presentTrend),
      teams: snapshot.leaderboards.teams.map(presentTrend),
    },
    recentActions: {
      bans: snapshot.recentActions.bans.map(action => presentAction(action, now, locale)),
      kicks: snapshot.recentActions.kicks.map(action => presentAction(action, now, locale)),
      unbans: snapshot.recentActions.unbans.map(action => presentAction(action, now, locale)),
    },
  }
}
