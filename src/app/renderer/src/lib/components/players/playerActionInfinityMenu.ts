import type { PlayerAction } from '$lib/core'
import { actionLabel, isActionBanActive } from '$lib/utils/playerActions'
import { gameCommandIssue } from '$lib/utils/gameProcessActions'
import {
	openInfinityMenu,
	type InfinityMenuLevel,
		type InfinityMenuPoint,
		type InfinityMenuItem,
} from '../ui/infinityMenu'

export type PlayerActionInfinityMenuCallbacks = {
	loadUnbanActions?: (action: PlayerAction) => Promise<InfinityMenuItem[]>
	onUnban?: (action: PlayerAction) => void | Promise<void>
	onOpenNotes?: (playerId: number) => void | Promise<void>
	noteCount?: number
	hasActiveWanted?: boolean
	gameAvailable?: boolean
	commandsBlocked?: boolean
  commandIssue?: string | null
}

export function createPlayerActionInfinityMenu(
	action: PlayerAction,
	actions: readonly PlayerAction[] = [action],
	callbacks: PlayerActionInfinityMenuCallbacks = {},
	now = new Date(),
): InfinityMenuLevel {
	const items = []
	const issue = gameCommandIssue(callbacks.gameAvailable === true, callbacks.commandsBlocked, callbacks.commandIssue)

	if (!callbacks.hasActiveWanted && isActionBanActive(action, actions, now)) {
		items.push({
			name: `Unban`,
			icon: `fa-unlock`,
			disabled: issue !== null,
			tooltip: issue ?? undefined,
			...(callbacks.loadUnbanActions
				? { loadChildren: () => callbacks.loadUnbanActions!(action) }
				: { action: () => callbacks.onUnban?.(action) }),
		})
	}

	items.push({
		name: `Notes`,
		suffix: `(${callbacks.noteCount ?? 0})`,
		icon: `fa-note-sticky`,
		action: () => callbacks.onOpenNotes?.(action.playerId),
	})

	return {
		name: actionLabel(action),
		icon: action.actionType === `ban` ? `fa-ban` : `fa-flag`,
		items,
	}
}

export function openPlayerActionInfinityMenu(
	event: MouseEvent,
	action: PlayerAction,
	actions: readonly PlayerAction[] = [action],
	callbacks: PlayerActionInfinityMenuCallbacks = {},
	playOpen: () => void = () => SFX.play(`open`),
): void {
	event.preventDefault()
	event.stopPropagation()

	openInfinityMenu(
		createPlayerActionInfinityMenu(action, actions, callbacks),
		positionFor(event),
		event.currentTarget as HTMLElement | null,
		playOpen,
	)
}

function positionFor(event: MouseEvent): InfinityMenuPoint {
	if (event.type === `contextmenu`) {
		return { x: event.clientX, y: event.clientY }
	}

	const target = event.currentTarget as HTMLElement | null
	if (!target) return { x: event.clientX, y: event.clientY }
	const rect = target.getBoundingClientRect()
	return { x: rect.right, y: rect.bottom }
}
