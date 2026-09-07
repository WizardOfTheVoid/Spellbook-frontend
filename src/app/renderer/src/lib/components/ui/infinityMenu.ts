import { readonly, writable } from "svelte/store"
import { placeAnchoredOverlay, type OverlayPlacement, type OverlayRect } from "$lib/utils/overlayPosition"

export type InfinityMenuAction = string | (() => void | Promise<void>)

export type InfinityMenuItem = {
	name: string
	badge?: number
	suffix?: string
	tooltip?: string
	icon: string
	iconType?: `light` | `brands`
	suffixIcon?: string
	action?: InfinityMenuAction
	disabled?: boolean
	children?: InfinityMenuItem[]
	loadChildren?: () => Promise<InfinityMenuItem[]>
	closeOnAction?: boolean
}

export type InfinityMenuLevel = {
	placement?: OverlayPlacement
	name: string
	icon: string
	items: InfinityMenuItem[]
}

export type InfinityMenuPoint = {
	x: number
	y: number
}

type InfinityMenuSize = {
	width: number
	height: number
}

export type InfinityMenuSnapshot = {
	id: number
	menu: InfinityMenuLevel
	position: InfinityMenuPoint
	owner: HTMLElement | null
}

const state = writable<InfinityMenuSnapshot | null>(null)
let nextId = 0

export const infinityMenuState = readonly(state)

export function openInfinityMenu(
	menu: InfinityMenuLevel,
	position: InfinityMenuPoint,
	owner: HTMLElement | null = null,
	playOpen: () => void = playInfinityMenuOpenCue,
): void {
	playOpen()
	state.set({ id: ++nextId, menu, position, owner })
}

export function closeInfinityMenu(): void {
	state.set(null)
}

export function updateInfinityMenuBadge(owner: HTMLElement, name: string, badge: number): void {
	state.update(snapshot => {
		if (snapshot?.owner !== owner || snapshot.menu.items.find(item => item.name === name)?.badge === badge) return snapshot
		return { ...snapshot, menu: { ...snapshot.menu,
			items: snapshot.menu.items.map(item => item.name === name ? { ...item, badge } : item) } }
	})
}

export function closeInfinityMenuOnContextMenu(
	event: Pick<Event, `preventDefault`>,
): void {
	event.preventDefault()
	closeInfinityMenu()
}

export function resolveInfinityMenuLevel(
	root: InfinityMenuLevel,
	path: number[],
	loadedChildren = new Map<string, InfinityMenuItem[]>(),
): InfinityMenuLevel | null {
	let current = root
	const currentPath: number[] = []

	for (const index of path) {
		const item = current.items[index]
		if (!item) return null
		currentPath.push(index)

		current = {
			name: item.name,
			icon: item.icon,
			items: loadedChildren.get(currentPath.join(`.`)) ?? item.children ?? [],
		}
	}

	return current
}

export async function loadInfinityMenuChildren(
	item: InfinityMenuItem,
	retry: () => void | Promise<void>,
	onError: (error: unknown) => void = () => {},
): Promise<InfinityMenuItem[]> {
	try {
		const children = await item.loadChildren?.() ?? []
		return children.length > 0
			? children
			: [{ name: `No offenses`, icon: `fa-circle-info`, disabled: true }]
	} catch (error) {
		onError(error)
		return [{
			name: `Retry`,
			icon: `fa-rotate-right`,
			closeOnAction: false,
			action: retry,
		}]
	}
}

export function positionInfinityMenu(
	snapshot: Pick<InfinityMenuSnapshot, `position` | `owner`> & { menu?: InfinityMenuLevel },
	menuSize: InfinityMenuSize,
	viewportSize: InfinityMenuSize,
): InfinityMenuPoint {
	const owner = snapshot.owner
	const anchor = owner && typeof owner.getBoundingClientRect === `function`
		? overlayRect(owner.getBoundingClientRect())
		: pointRect(snapshot.position)

	return placeAnchoredOverlay(anchor, menuSize, viewportSize, snapshot.menu?.placement)
}

function overlayRect(rect: DOMRect): OverlayRect {
	return {
		left: rect.left,
		top: rect.top,
		right: rect.right,
		bottom: rect.bottom,
		width: rect.width,
		height: rect.height,
	}
}

function pointRect(point: InfinityMenuPoint): OverlayRect {
	return {
		left: point.x,
		top: point.y,
		right: point.x,
		bottom: point.y,
		width: 0,
		height: 0,
	}
}

function playInfinityMenuOpenCue(): void {
	if (typeof SFX !== `undefined`) SFX.play(`open`)
}
