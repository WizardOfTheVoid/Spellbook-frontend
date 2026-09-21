import type { PlayerAction } from '$lib/core'
import { actionLabel, isActionBanActive } from '$lib/utils/playerActions'
import { notifyError, notifySuccess } from '$lib/notifications/notificationEvents'
import {
	openInfinityMenu,
	type InfinityMenuLevel,
		type InfinityMenuPoint,
		type InfinityMenuItem,
} from '../ui/infinityMenu'

export type PlayerActionInfinityMenuCallbacks = {
  onRemove?: (action: PlayerAction) => void | Promise<void>
  onUnban?: (action: PlayerAction) => void | Promise<void>
  onCopyId?: (id: number) => void | Promise<void>
}

export function createPlayerActionInfinityMenu(
  action: PlayerAction,
  actions: readonly PlayerAction[] = [action],
  callbacks: PlayerActionInfinityMenuCallbacks = {},
  now = new Date(),
): InfinityMenuLevel {
  const items: InfinityMenuItem[] = [{ name: `Remove offense`, icon: `fa-trash`, action: () => callbacks.onRemove?.(action) }]
  if (isActionBanActive(action, actions, now)) items.unshift({ name: `Unban & remove offense`, icon: `fa-unlock`, action: () => callbacks.onUnban?.(action) })
  items.push({ name: `Copy offense ID`, icon: `fa-copy`, action: async () => {
    if (callbacks.onCopyId) return callbacks.onCopyId(action.id)
    try {
      await navigator.clipboard.writeText(String(action.id))
      notifySuccess(`Offense ID copied.`)
    }
    catch { notifyError(`Could not copy the offense ID.`) }
  } })
  return { name: actionLabel(action), icon: action.actionType === `ban` ? `fa-ban` : `fa-flag`, items }
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
