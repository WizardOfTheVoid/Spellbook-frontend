import type { PlayerAction } from '$lib/core'

export function actionLabel(action: PlayerAction): string {
	if (action.actionType === `unban`) return `Unban`
	const actionType = titleCase(action.actionType)
	const offenseType = action.offenseType ? titleCase(action.offenseType) : ``
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

export function formatActionTooltip(action: PlayerAction): string {
	const server = action.gameServer?.displayName?.trim()
		|| action.gameServer?.name?.trim()
		|| `#${action.gameServerId}`
	const author = action.author.username?.trim()
		|| action.author.playfabId?.trim()
		|| `#${action.authorId}`

	return `Server: ${server}\nAdmin: ${author}\nDuration: ${formatActionDuration(action)}`
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

function titleCase(value: string): string {
	return value.replaceAll(`_`, ` `).replace(/^./u, first => first.toUpperCase())
}

function timestamp(value: string | null): number | null {
	if (!value) return null
	const result = new Date(value).getTime()
	return Number.isNaN(result) ? null : result
}
