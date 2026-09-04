import type { InfinityMenuPoint } from "../ui/infinityMenu"

type MenuEvent = Pick<MouseEvent, `clientX` | `clientY` | `preventDefault` | `stopPropagation`> & {
	currentTarget: EventTarget | null
}

export type PlayerMenuRequest = {
	position: InfinityMenuPoint
	owner: HTMLElement
}

export function createContextMenuRequest(event: MenuEvent): PlayerMenuRequest {
	event.preventDefault()
	event.stopPropagation()

	return {
		position: { x: event.clientX, y: event.clientY },
		owner: event.currentTarget as HTMLElement,
	}
}

export function createEllipsisMenuRequest(event: MenuEvent): PlayerMenuRequest | null {
	event.preventDefault()
	event.stopPropagation()

	const button = event.currentTarget as HTMLElement | null
	if (!button) return null
	const owner = button.closest(`.list-row`) as HTMLElement | null
	if (!owner) return null
	const rect = button.getBoundingClientRect()

	return {
		position: { x: rect.right, y: rect.bottom },
		owner,
	}
}
