import type { ActiveBanKind, PlayerPunishmentSummary } from '$lib/core'
import { formatFullDateTime } from './playerUtils'
import { formatOffenseType } from './formatOffenseType'
import { getNumberField, getStringField, isRecord } from './records'

const recentPunishmentMs = 7 * 24 * 60 * 60 * 1000
const labels = { ban: `Ban`, kick: `Kick`, warn: `Warning` }

export type PlayerRowState = `offense` | `kick` | `ban` | `lowLevelBan` | `otherBan` | `cheatingBan` | `wanted` | null

export function normalizePunishment(value: unknown): PlayerPunishmentSummary | null {
  if (!isRecord(value)) return null
  const id = getNumberField(value, `id`)
  const actionType = getStringField(value, `actionType`)
  const createdAt = getStringField(value, `createdAt`)
  if (!id || !Number.isInteger(id) || id < 1 || !actionType || !Object.hasOwn(labels, actionType)
    || !createdAt || !Number.isFinite(Date.parse(createdAt))) return null
  return {
    id, actionType: actionType as PlayerPunishmentSummary[`actionType`], createdAt,
    offenseType: getStringField(value, `offenseType`),
    reason: getStringField(value, `reason`),
    expiresAt: getStringField(value, `expiresAt`)
  }
}

export function playerPunishmentStatus(player: {
  isWanted?: boolean
  activeBan?: PlayerPunishmentSummary | null
  latestPunishment?: PlayerPunishmentSummary | null
  strongestRecentPunishment?: PlayerPunishmentSummary | null
  activeBanKind?: ActiveBanKind | null
}, now: number): { state: PlayerRowState, tooltip: string } {
  const ban = player.activeBan
  const activeBan = ban && Date.parse(ban.createdAt) <= now
    && (ban.expiresAt === null || Date.parse(ban.expiresAt) >= now) ? ban : null
  const latest = player.strongestRecentPunishment ?? player.latestPunishment
  const age = latest ? now - Date.parse(latest.createdAt) : Number.NaN
  const recent = age >= 0 && age <= recentPunishmentMs ? latest : null
  const selected = activeBan ?? recent
  const legacyBan = player.activeBan === undefined && Boolean(player.activeBanKind)
  const banKind = player.activeBanKind ?? (activeBan?.offenseType === `hacker` ? `hacker` : null)
  let state: PlayerRowState = null
  if (recent) state = recent.actionType === `ban` ? `ban` : recent.actionType === `kick` ? `kick` : `offense`
  if (activeBan || legacyBan) state = banKind === `hacker` ? `cheatingBan`
    : activeBan?.offenseType === `low_level` ? `lowLevelBan`
    : banKind === `other` ? `otherBan` : `ban`
  if (player.isWanted) state = `wanted`
  return {
    state,
    tooltip: player.isWanted ? `Player is wanted`
      : selected ? punishmentTooltip(selected, Boolean(activeBan), now) : legacyBan ? `Banned` : ``
  }
}

function punishmentTooltip(punishment: PlayerPunishmentSummary, activeBan: boolean, now: number): string {
  const expiry = punishment.expiresAt
    ? `${Date.parse(punishment.expiresAt) < now ? `Expired` : `Expires`} ${formatFullDateTime(punishment.expiresAt)}`
    : punishment.actionType === `ban` ? `Permanent` : null
  return [
    activeBan ? `Banned` : labels[punishment.actionType],
    punishment.offenseType ? formatOffenseType(punishment.offenseType) : null,
    punishment.reason,
    `Issued ${formatFullDateTime(punishment.createdAt)}`,
    expiry
  ].filter(Boolean).join(` · `)
}
