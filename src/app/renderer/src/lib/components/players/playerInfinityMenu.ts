import { notifyError, notifySuccess } from '$lib/notifications/notificationEvents'
import { GAME_PROCESS_REQUIRED_TOOLTIP } from '$lib/utils/gameProcessActions'
import { loadProfileActionMenu } from '$lib/utils/profileActionMenu'
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
	loadProfileActions?: (excludeUnban: boolean) => Promise<InfinityMenuItem[]>
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
		{
			name: `In-game actions`,
			icon: `fa-bolt`,
			disabled: !gameAvailable,
			tooltip: gameAvailable ? undefined : GAME_PROCESS_REQUIRED_TOOLTIP,
			loadChildren: () => dependencies.loadProfileActions
				? dependencies.loadProfileActions(Boolean(dependencies.wanted))
				: loadProfileActionMenu(target, { excludeUnban: Boolean(dependencies.wanted) }),
		},
	)
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

async function copyPlayfabId(playfabId: string): Promise<void> {
	try {
		await navigator.clipboard.writeText(playfabId)
		notifySuccess(`PlayFab ID copied.`)
	} catch {
		notifyError(`Could not copy the PlayFab ID.`)
	}
}
