import type { PlayerAction } from '$lib/core'
import {
	notifyError,
	notifyInfo,
	notifySuccess,
	notifyWarning,
} from '$lib/notifications/notificationEvents'
import { actionLabel, isActionBanActive } from '$lib/utils/playerActions'
import { fetchAllPlayerActions } from '$lib/utils/playerActionsApi'
import { formatDateTime } from '$lib/utils/playerUtils'
import { unbanPlayer } from '$lib/utils/unbanPlayer'
import { GAME_PROCESS_REQUIRED_TOOLTIP } from '$lib/utils/gameProcessActions'
import {
	openInfinityMenu,
	type InfinityMenuItem,
	type InfinityMenuLevel,
	type InfinityMenuPoint,
} from '../ui/infinityMenu'

export type PlayerInfinityMenuTarget = {
	playerId: number
	name: string
	playfabId: string
	onOpen: () => void
}

export type PlayerInfinityMenuDependencies = {
	fetchActions?: (playerId: number) => Promise<PlayerAction[]>
	onUnban?: (
		target: PlayerInfinityMenuTarget,
		actionId?: number,
	) => void | Promise<void>
	wanted?: PlayerWantedMenuContext
	gameAvailable?: boolean
}

export type PlayerWantedMenuContext = {
	actionType: `ban` | `unban` | `mock` | null
	sourceActionId: number | null
	sourceAuthorId: number | null
	viewerId: number
	isSuperadmin: boolean
	onRevert?: (sourceActionId: number) => void | Promise<void>
	onRemove?: () => void | Promise<void>
	onOpenWanted?: () => void
	onOpenProfile?: () => void
}

const commonModerationReasons = [`Hacking`, `FFA`, `Toxic`, `Low level`]
const warnReasons = [`FFA`, `Racism`, `Toxic`, `Low level`]

export function createPlayerInfinityMenu(
	target: PlayerInfinityMenuTarget,
	dependencies: PlayerInfinityMenuDependencies = {},
): InfinityMenuLevel {
	const gameAvailable = dependencies.gameAvailable === true
	const items: InfinityMenuItem[] = dependencies.wanted ? [
		{
			name: `Open wanted`,
			icon: `fa-crosshairs`,
			action: dependencies.wanted.onOpenWanted ?? target.onOpen,
		},
		{
			name: `Open profile`,
			icon: `fa-user`,
			action: dependencies.wanted.onOpenProfile ?? target.onOpen,
		},
	] : [
		{
			name: `Open profile`,
			icon: `fa-user`,
			action: target.onOpen,
		},
	]
	items.push(
		{
			name: `Copy PlayFab ID`,
			icon: `fa-copy`,
			action: () => void copyPlayfabId(target.playfabId),
		},
		moderationMenu(`Ban`, `fa-ban`, commonModerationReasons, target.name, gameAvailable),
		moderationMenu(`Kick`, `fa-user-slash`, commonModerationReasons, target.name, gameAvailable),
		moderationMenu(`Warn`, `fa-triangle-exclamation`, warnReasons, target.name, gameAvailable),
	)
	if (!dependencies.wanted) items.push(unbanMenu(target, dependencies, gameAvailable))
	const admin = dependencies.wanted ? wantedAdminMenu(dependencies.wanted) : null
	if (admin) items.push(admin)

	return {
		name: target.name,
		icon: `fa-user`,
		items,
	}
}

function wantedAdminMenu(context: PlayerWantedMenuContext): InfinityMenuItem | null {
	const children: InfinityMenuItem[] = []
	const canRevert = context.actionType === `ban`
		&& context.sourceActionId !== null
		&& (context.isSuperadmin || context.sourceAuthorId === context.viewerId)
	if (canRevert) {
		children.push({
			name: `Revert global ban`,
			icon: `fa-rotate-left`,
			action: () => context.onRevert?.(context.sourceActionId!),
		})
	}
	if (context.isSuperadmin) {
		children.push({
			name: `Remove player`,
			icon: `fa-user-minus`,
			action: () => context.onRemove?.(),
		})
	}
	return children.length > 0 ? { name: `Admin`, icon: `fa-shield-halved`, children } : null
}

export function openPlayerInfinityMenu(
	position: InfinityMenuPoint,
	owner: HTMLElement | null,
	target: PlayerInfinityMenuTarget,
	playOpen: () => void = () => SFX.play(`open`),
	dependencies: PlayerInfinityMenuDependencies = {},
): void {
	openInfinityMenu(createPlayerInfinityMenu(target, dependencies), position, owner, playOpen)
}

function moderationMenu(
	name: string,
	icon: string,
	reasons: readonly string[],
	playerName: string,
	gameAvailable: boolean,
): InfinityMenuItem {
	return {
		name,
		icon,
		disabled: !gameAvailable,
		tooltip: gameAvailable ? undefined : GAME_PROCESS_REQUIRED_TOOLTIP,
		children: reasons.map(reason => ({
			name: reason,
			icon: reasonIcon(reason),
			action: () => notifyInfo(`${name} mock: ${reason} for ${playerName}.`),
		})),
	}
}

function unbanMenu(
	target: PlayerInfinityMenuTarget,
	dependencies: PlayerInfinityMenuDependencies,
	gameAvailable: boolean,
): InfinityMenuItem {
	return {
		name: `Unban`,
		icon: `fa-user-shield`,
		disabled: !gameAvailable,
		tooltip: gameAvailable ? undefined : GAME_PROCESS_REQUIRED_TOOLTIP,
		loadChildren: async () => {
			const actions = await (dependencies.fetchActions ?? fetchAllPlayerActions)(target.playerId)
			const eligible = actions.filter(action => isActionBanActive(action, actions))
			const direct = unbanItem(target, dependencies)

			if (eligible.length === 0) return [direct]

			return [{
				name: `Unban by offense`,
				icon: `fa-list`,
				children: eligible.map(action => ({
					name: `${actionLabel(action)} · ${formatDateTime(action.createdAt)}`,
					icon: `fa-ban`,
					action: () => runUnban(target, dependencies, action.id),
				})),
			}, direct]
		},
	}
}

function unbanItem(
	target: PlayerInfinityMenuTarget,
	dependencies: PlayerInfinityMenuDependencies,
): InfinityMenuItem {
	return {
		name: `Unban without offense`,
		icon: `fa-unlock`,
		action: () => runUnban(target, dependencies),
	}
}

async function runUnban(
	target: PlayerInfinityMenuTarget,
	dependencies: PlayerInfinityMenuDependencies,
	actionId?: number,
): Promise<void> {
	if (dependencies.onUnban) {
		await dependencies.onUnban(target, actionId)
		return
	}

	try {
		const result = await unbanPlayer({
			playerId: target.playerId,
			playfabId: target.playfabId,
			playerName: target.name,
			actionId,
		})

		if (result.ok) notifySuccess(result.message)
		else if (result.auditFailed) notifyWarning(result.message)
		else notifyError(result.message)
	} catch (error) {
		notifyError(error instanceof Error ? error.message : `Unban failed.`)
	}
}

function reasonIcon(reason: string): string {
	if (reason === `Hacking`) return `fa-bug`
	if (reason === `FFA`) return `fa-crosshairs`
	if (reason === `Racism`) return `fa-comment-slash`
	if (reason === `Toxic`) return `fa-skull-crossbones`
	return `fa-ranking-star`
}

async function copyPlayfabId(playfabId: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(playfabId)
		notifySuccess(`PlayFab ID copied.`)
	} catch {
		notifyError(`Could not copy the PlayFab ID.`)
	}
}
