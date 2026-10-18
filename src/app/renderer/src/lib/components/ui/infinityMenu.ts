import { readonly, writable } from "svelte/store"
import { placeAnchoredOverlay, type OverlayPlacement, type OverlayRect } from "$lib/utils/overlayPosition"

export type InfinityMenuAction = string | (() => void | Promise<void>)

type InfinityMenuItemBase = {
	name: string
	separator?: boolean
	subtitle?: string
	badge?: number
	suffix?: string
	tooltip?: string
	icon: string
	iconType?: `solid` | `regular` | `light` | `thin` | `brands`
	iconColor?: string
	suffixIcon?: string
	disabled?: boolean
}

export type InfinityMenuItem = InfinityMenuItemBase & (
	| {
		toggle: { checked: boolean, group?: string, onChange: (checked: boolean) => void | Promise<void> }
		action?: never
		children?: never
		loadChildren?: never
		closeOnAction?: never
	}
	| {
		toggle?: never
		action?: InfinityMenuAction
		children?: InfinityMenuItem[]
		loadChildren?: () => Promise<InfinityMenuItem[]>
		closeOnAction?: boolean
	}
)

export const infinityMenuSeparator: InfinityMenuItem = { name: ``, icon: ``, separator: true, disabled: true }

export type InfinityMenuLevel = {
	placement?: OverlayPlacement
	name: string
	subtitle?: string
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
	container: HTMLElement | null
}

const state = writable<InfinityMenuSnapshot | null>(null)
let nextId = 0

export const infinityMenuState = readonly(state)

export function openInfinityMenu(
	menu: InfinityMenuLevel,
	position: InfinityMenuPoint,
	owner: HTMLElement | null = null,
	playOpen: () => void = playInfinityMenuOpenCue,
	container: HTMLElement | null = null,
): void {
	playOpen()
	state.set({ id: ++nextId, menu, position, owner, container })
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
		if (!item || item.separator) return null
		currentPath.push(index)

		current = {
			name: item.name,
			subtitle: item.subtitle,
			icon: item.icon,
			items: loadedChildren.get(currentPath.join(`.`)) ?? item.children ?? [],
		}
	}

	return current
}

export async function toggleInfinityMenuItem(item: InfinityMenuItem, checked: boolean): Promise<boolean> {
	if (!item.toggle || item.disabled) return checked
	if (item.toggle.group && checked) return true
	const nextChecked = !checked
	await item.toggle.onChange(nextChecked)
	return nextChecked
}

export function selectInfinityMenuToggles(items: InfinityMenuItem[], index: number, checked: boolean): Map<number, boolean> {
	const group = items[index]?.toggle?.group
	if (!group) return new Map([[index, checked]])
	return new Map(items.flatMap((item, peerIndex) => item.toggle?.group === group ? [[peerIndex, peerIndex === index] as const] : []))
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
	visiblePosition?: InfinityMenuPoint,
): InfinityMenuPoint {
	const placement = snapshot.menu?.placement
	if (visiblePosition || !placement) {
		const point = visiblePosition ?? snapshot.position
		return {
			x: Math.max(12, Math.min(point.x, viewportSize.width - menuSize.width - 12)),
			y: Math.max(12, Math.min(point.y, viewportSize.height - menuSize.height - 12)),
		}
	}

	const owner = snapshot.owner
	const anchor = owner && typeof owner.getBoundingClientRect === `function`
		? overlayRect(owner.getBoundingClientRect())
		: pointRect(snapshot.position)

	return placeAnchoredOverlay(anchor, menuSize, viewportSize, placement, placement === `bottom` ? 4 : undefined)
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
