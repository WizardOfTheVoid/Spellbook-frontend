import type { PlayerAction } from '$lib/core'
import { formatOffenseType } from './formatOffenseType'

export function filterActionsByRange(
	actions: readonly PlayerAction[],
	range = `all`,
	now = new Date(),
): readonly PlayerAction[] {
	if (range !== `30` && range !== `90`) return actions
	const cutoff = now.getTime() - Number(range) * 24 * 60 * 60 * 1000
	return actions.filter(action => {
		const createdAt = timestamp(action.createdAt)
		return createdAt !== null && createdAt >= cutoff
	})
}

export function actionLabel(action: PlayerAction): string {
	if (action.actionType === `unban`) return `Unban`
	const actionType = formatActionType(action.actionType)
	const offenseType = action.offenseType ? formatOffenseType(action.offenseType) : ``
	return offenseType ? `${actionType}: ${offenseType}` : actionType
}

export function formatActionDuration(action: PlayerAction): string {
	if (action.actionType === `ban` && action.duration === null) return `Permanent`
	return typeof action.duration === `number` && Number.isFinite(action.duration)
		? `${action.duration} hours`
		: `--`
}

export function formatActionHoursLeft(
	action: PlayerAction,
	now = new Date(),
): string {
	if (action.actionType !== `ban`) return `--`
	if (action.duration === null) return `Permanent`
	if (!Number.isFinite(action.duration)) return `--`

	const createdAt = timestamp(action.createdAt)
	const expiresAt = timestamp(action.expiresAt)
		?? (createdAt === null ? null : createdAt + action.duration * 60 * 60 * 1000)
	if (expiresAt === null) return `--`

	const remainingHours = Math.ceil((expiresAt - now.getTime()) / (60 * 60 * 1000))
	if (remainingHours <= 0) return `Expired`
	return `${remainingHours} ${remainingHours === 1 ? `hour` : `hours`}`
}

export function formatActionTooltip(
	action: PlayerAction,
	actions: readonly PlayerAction[] = [],
	now = new Date(),
): string {
	return `Type: ${action.actionType}\nDuration: ${formatServedDuration(action, actions, now)}\nAuthor: ${actionAuthor(action)}\nServer: ${actionServer(action)}`
}

export function actionServer(action: PlayerAction): string {
	return action.gameServer?.displayName?.trim()
		|| action.gameServer?.name?.trim()
		|| `#${action.gameServerId}`
}

export function formatServedDuration(action: PlayerAction, actions: readonly PlayerAction[], now = new Date()): string {
	if (action.actionType !== `ban`) return `None`
	const createdAt = timestamp(action.createdAt)
	if (createdAt === null) return `Unknown`
	const hour = 60 * 60 * 1000
	let servedUntil = Math.min(now.getTime(), timestamp(action.expiresAt) ?? Infinity)
	if (action.duration !== null) {
		if (!Number.isFinite(action.duration) || action.duration < 0) return `Unknown`
		servedUntil = Math.min(servedUntil, createdAt + action.duration * hour)
	}
	for (const candidate of actions) {
		if (candidate.actionType !== `unban` || candidate.relatedActionId !== action.id) continue
		servedUntil = Math.min(servedUntil, timestamp(candidate.createdAt) ?? Infinity)
	}
	const served = Math.floor(Math.max(0, servedUntil - createdAt) / hour)
	return action.duration === null ? `${served} hours / Permanent` : `${served}/${action.duration} hours`
}

export function isActionBanActive(
	action: PlayerAction,
	actions: readonly PlayerAction[],
	now = new Date(),
): boolean {
	if (action.actionType !== `ban`) return false

	const createdAt = timestamp(action.createdAt)
	if (createdAt === null || createdAt > now.getTime()) return false
	if (actions.some(candidate => (
		candidate.actionType === `unban` && candidate.relatedActionId === action.id
	))) return false
	if (action.duration === null) return true

	const expiresAt = timestamp(action.expiresAt)
	const calculatedExpiry = createdAt + action.duration * 60 * 60 * 1000
	return (expiresAt ?? calculatedExpiry) >= now.getTime()
}

export function actionAuthor(action: Pick<PlayerAction, `author` | `authorId`>): string {
	return action.author.username?.trim()
		|| action.author.playfabId?.trim()
		|| `#${action.authorId}`
}

export function actionAuthorWithTeam(action: PlayerAction): string {
	const author = actionAuthor(action)
	const teamName = action.creditedTeam?.name?.trim()
	return teamName ? `${author} @ ${teamName}` : author
}

export function formatActionType(value: PlayerAction[`actionType`]): string {
	return value.replaceAll(`_`, ` `).replace(/^./u, first => first.toUpperCase())
}

function timestamp(value: string | null): number | null {
	if (!value) return null
	const result = new Date(value).getTime()
	return Number.isNaN(result) ? null : result
}
