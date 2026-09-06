import type { WantedPlayerListItem } from '$lib/core'
import type { PlayerWantedMenuContext } from './playerInfinityMenu'

type WantedRowViewer = { id: number, isSuperadmin: boolean }
type WantedRowHandlers = Pick<
	PlayerWantedMenuContext,
	`onRevert` | `onRemove` | `onOpenWanted` | `onOpenProfile`
>

export function canRunWantedRowMutation(
	kind: `revert` | `remove`,
	playerId: number | null,
	sourceActionId: number | null,
): boolean {
	return playerId !== null && (kind === `remove` || sourceActionId !== null)
}

export function createWantedRowMenuContext(
	wanted: WantedPlayerListItem[`wanted`],
	viewer: WantedRowViewer,
	handlers: WantedRowHandlers,
): PlayerWantedMenuContext {
	return {
		actionType: wanted.actionType,
		sourceActionId: wanted.originalActionId,
		sourceAuthorId: wanted.author?.id ?? null,
		viewerId: viewer.id,
		isSuperadmin: viewer.isSuperadmin,
		...handlers,
	}
}
