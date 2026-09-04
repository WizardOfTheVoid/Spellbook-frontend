import assert from "node:assert/strict"
import test from "node:test"
import { get } from "svelte/store"
import type { PlayerAction } from "$lib/core"
import { playDefaultButtonSfx } from "$lib/global/sfx/delegatedSfx"
import {
	closeInfinityMenu,
	infinityMenuState,
	type InfinityMenuItem,
	type InfinityMenuLevel,
	type InfinityMenuPoint,
} from "../ui/infinityMenu"

type PlayerMenuTarget = {
	playerId: number
	name: string
	playfabId: string
	onOpen: () => void
}

type PlayerInfinityMenuModule = {
	createPlayerInfinityMenu: (
		target: PlayerMenuTarget,
		dependencies?: PlayerMenuDependencies,
	) => InfinityMenuLevel
	openPlayerInfinityMenu: (
		position: InfinityMenuPoint,
		owner: HTMLElement | null,
		target: PlayerMenuTarget,
		playOpen?: () => void,
	) => void
}

type PlayerMenuDependencies = {
	fetchActions?: (playerId: number) => Promise<PlayerAction[]>
	onUnban?: (target: PlayerMenuTarget, actionId?: number) => void | Promise<void>
	wanted?: {
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
	gameAvailable?: boolean
}

type PlayerMenuRequest = {
	position: InfinityMenuPoint
	owner: HTMLElement
}

type PlayerMenuRequestsModule = {
	createContextMenuRequest: (event: MenuEvent) => PlayerMenuRequest
	createEllipsisMenuRequest: (event: MenuEvent) => PlayerMenuRequest | null
}

type MenuEvent = Pick<MouseEvent, `clientX` | `clientY` | `preventDefault` | `stopPropagation`> & {
	currentTarget: HTMLElement
}

test(`creates one player menu with the fixed action order and lazy Unban entry`, async () => {
	const { createPlayerInfinityMenu } = await loadPlayerInfinityMenu()
	let fetchCalls = 0
	const menu = createPlayerInfinityMenu(target(), {
		gameAvailable: true,
		fetchActions: async () => {
			fetchCalls += 1
			return []
		},
	})

	assert.deepEqual(menu.items.map(item => item.name), [
		`Open profile`, `Copy PlayFab ID`, `Ban`, `Kick`, `Warn`, `Unban`,
	])

	const unban = itemNamed(menu.items, `Unban`)
	assert.equal(fetchCalls, 0)
	assert.equal(typeof unban.loadChildren, `function`)
	await unban.loadChildren?.()
	assert.equal(fetchCalls, 1)
})

test(`known Wanted state hides generic Unban and exposes only the exact Admin matrix`, async () => {
	const { createPlayerInfinityMenu } = await loadPlayerInfinityMenu()
	const calls: string[] = []
	const wanted = {
		actionType: `ban` as const,
		sourceActionId: 9,
		sourceAuthorId: 3,
		viewerId: 3,
		isSuperadmin: false,
		onRevert: async (sourceActionId: number) => {
			calls.push(`revert:${sourceActionId}`)
		},
		onRemove: async () => {
			calls.push(`remove`)
		},
		onOpenWanted: () => calls.push(`wanted`),
		onOpenProfile: () => calls.push(`profile`),
	}
	const authorMenu = createPlayerInfinityMenu(target(), { wanted })
	assert.deepEqual(authorMenu.items.slice(0, 2).map(item => item.name), [
		`Open wanted`,
		`Open profile`,
	])
	await runItem(authorMenu.items[0]!)
	await runItem(authorMenu.items[1]!)
	const authorAdmin = itemNamed(authorMenu.items, `Admin`)

	assert.equal(authorMenu.items.some(item => item.name === `Unban`), false)
	assert.deepEqual(authorAdmin.children?.map(item => item.name), [`Revert global ban`])
	await runItem(authorAdmin.children![0]!)

	const superadminMenu = createPlayerInfinityMenu(target(), {
		wanted: { ...wanted, viewerId: 4, isSuperadmin: true },
	})
	const superadminAdmin = itemNamed(superadminMenu.items, `Admin`)
	assert.deepEqual(superadminAdmin.children?.map(item => item.name), [
		`Revert global ban`,
		`Remove player`,
	])
	for (const item of superadminAdmin.children ?? []) await runItem(item)

	for (const context of [
		{ ...wanted, viewerId: 4, isSuperadmin: false },
		{ ...wanted, actionType: `mock` as const, viewerId: 4, isSuperadmin: false },
		{ ...wanted, actionType: `unban` as const, viewerId: 4, isSuperadmin: false },
	]) {
		const menu = createPlayerInfinityMenu(target(), { wanted: context })
		assert.equal(menu.items.some(item => item.name === `Admin`), false)
		assert.equal(menu.items.some(item => item.name === `Unban`), false)
	}

	for (const actionType of [`mock`, `unban`, null] as const) {
		const menu = createPlayerInfinityMenu(target(), {
			wanted: { ...wanted, actionType, viewerId: 4, isSuperadmin: true },
		})
		assert.deepEqual(itemNamed(menu.items, `Admin`).children?.map(item => item.name), [`Remove player`])
	}

	assert.deepEqual(calls, [`wanted`, `profile`, `revert:9`, `revert:9`, `remove`])
})

test(`opens the same menu at supplied row and ellipsis positions with one sound`, async () => {
	const { openPlayerInfinityMenu } = await loadPlayerInfinityMenu()
	const owner = {} as HTMLElement
	let opened = 0
	const playOpen = () => (opened += 1)

	openPlayerInfinityMenu({ x: 300, y: 240 }, owner, target(), playOpen)

	assert.equal(opened, 1)
	assert.deepEqual(get(infinityMenuState)?.position, { x: 300, y: 240 })
	assert.equal(get(infinityMenuState)?.owner, owner)

	openPlayerInfinityMenu({ x: 18, y: 42 }, owner, target(), playOpen)

	assert.equal(opened, 2)
	assert.deepEqual(get(infinityMenuState)?.position, { x: 18, y: 42 })
	assert.equal(get(infinityMenuState)?.owner, owner)

	closeInfinityMenu()
})

test(`builds stopped row and ellipsis requests with one row owner and one open cue`, async () => {
	const { createContextMenuRequest, createEllipsisMenuRequest } = await loadPlayerMenuRequests()
	const { openPlayerInfinityMenu } = await loadPlayerInfinityMenu()
	const row = {} as HTMLElement
	const ellipsis = button({ right: 18, bottom: 42 }, row)
	const contextEvent = menuEvent(row, 300, 240)
	const ellipsisEvent = menuEvent(ellipsis, 0, 0)
	let opened = 0

	const contextRequest = createContextMenuRequest(contextEvent)
	const ellipsisRequest = createEllipsisMenuRequest(ellipsisEvent)
	assert.ok(ellipsisRequest)
	openPlayerInfinityMenu(
		contextRequest.position,
		contextRequest.owner,
		target(),
		() => (opened += 1),
	)
	openPlayerInfinityMenu(
		ellipsisRequest.position,
		ellipsisRequest.owner,
		target(),
		() => (opened += 1),
	)
	playDefaultButtonSfx(ellipsis as unknown as Element, () => (opened += 1))

	assert.deepEqual(contextRequest.position, { x: 300, y: 240 })
	assert.deepEqual(ellipsisRequest.position, { x: 18, y: 42 })
	assert.equal(contextRequest.owner, row)
	assert.equal(ellipsisRequest.owner, row)
	assert.equal(contextEvent.prevented, true)
	assert.equal(contextEvent.stopped, true)
	assert.equal(ellipsisEvent.prevented, true)
	assert.equal(ellipsisEvent.stopped, true)
	assert.equal(opened, 2)

	closeInfinityMenu()
})

test(`loads eligible full-history bans and the explicit no-offense path`, async () => {
	const { createPlayerInfinityMenu } = await loadPlayerInfinityMenu()
	const selected: Array<number | undefined> = []
	const active = playerAction()
	const expired = playerAction({ id: 10, duration: 1, createdAt: `2020-08-26T10:00:00.000Z` })
	const nonBan = playerAction({ id: 11, actionType: `warn`, duration: null })
	const closed = playerAction({ id: 12 })
	const relatedUnban = playerAction({
		id: 13,
		actionType: `unban`,
		offenseType: null,
		relatedActionId: closed.id,
	})
	const menu = createPlayerInfinityMenu(target(), {
		gameAvailable: true,
		fetchActions: async () => [active, expired, nonBan, closed, relatedUnban],
		onUnban: async (_target, actionId) => {
			selected.push(actionId)
		},
	})
	const children = await itemNamed(menu.items, `Unban`).loadChildren?.() ?? []

	assert.deepEqual(children.map(item => item.name), [`Unban by offense`, `Unban without offense`])
	const choices = itemNamed(children, `Unban by offense`).children ?? []
	assert.equal(choices.length, 1)
	assert.match(choices[0].name, /^Ban: Hacker · /u)
	await runItem(choices[0])
	await runItem(itemNamed(children, `Unban without offense`))
	assert.deepEqual(selected, [9, undefined])
})

test(`shows one direct no-offense item when no ban is eligible`, async () => {
	const { createPlayerInfinityMenu } = await loadPlayerInfinityMenu()
	const expired = playerAction({ duration: 1, createdAt: `2020-08-26T10:00:00.000Z` })
	const menu = createPlayerInfinityMenu(target(), {
		gameAvailable: true,
		fetchActions: async () => [expired],
		onUnban: async () => {},
	})
	const children = await itemNamed(menu.items, `Unban`).loadChildren?.() ?? []

	assert.deepEqual(children.map(item => item.name), [`Unban without offense`])
	assert.equal(typeof children[0].action, `function`)
})

function itemNamed(items: InfinityMenuItem[], name: string): InfinityMenuItem {
	const item = items.find(item => item.name === name)
	assert.ok(item, `expected ${name} menu item`)
	return item
}

test(`keeps moderation entries visible but disabled while the game is unavailable`, async () => {
	const { createPlayerInfinityMenu } = await loadPlayerInfinityMenu()
	const menu = createPlayerInfinityMenu(target(), { gameAvailable: false })

	for (const name of [`Ban`, `Kick`, `Warn`, `Unban`]) {
		const item = itemNamed(menu.items, name)
		assert.equal(item.disabled, true)
		assert.equal(item.tooltip, `Chivalry 2 must be running.`)
	}
})

async function runItem(item: InfinityMenuItem): Promise<void> {
	assert.equal(typeof item.action, `function`)
	if (typeof item.action === `function`) await item.action()
}

function target(): PlayerMenuTarget {
	return {
		playerId: 42,
		name: `Alice`,
		playfabId: `PF-1`,
		onOpen: () => {},
	}
}

function playerAction(overrides: Partial<PlayerAction> = {}): PlayerAction {
	return {
		id: 9,
		playerId: 42,
		gameServerId: 7,
		authorId: 3,
		actionType: `ban`,
		offenseType: `hacker`,
		duration: null,
		reason: null,
		scope: `global`,
		relatedActionId: null,
		autoban: false,
		originalActionId: null,
		expiresAt: null,
		createdAt: `2020-08-26T12:00:00.000Z`,
		updatedAt: `2020-08-26T12:00:00.000Z`,
		author: { id: 3, username: `Admin`, playfabId: null },
		gameServer: { id: 7, name: `Duel`, displayName: null },
		...overrides,
	}
}

function button(
	rect: Pick<DOMRect, `right` | `bottom`>,
	owner: HTMLElement,
): HTMLElement {
	const element = {} as HTMLElement
	element.getBoundingClientRect = () => rect as DOMRect
	element.closest = (selector: string) => selector === `button` ? element : owner
	element.hasAttribute = (name: string) => name === `data-uisfx-ignore`
	return element
}

function menuEvent(
	currentTarget: HTMLElement,
	clientX: number,
	clientY: number,
): MenuEvent & { prevented: boolean; stopped: boolean } {
	return {
		currentTarget,
		clientX,
		clientY,
		prevented: false,
		stopped: false,
		preventDefault() {
			this.prevented = true
		},
		stopPropagation() {
			this.stopped = true
		},
	}
}

async function loadPlayerMenuRequests(): Promise<PlayerMenuRequestsModule> {
	const modulePath = `./playerMenuRequests`
	const module = await import(modulePath).catch(() => ({}))
	const createContextMenuRequest = Reflect.get(module, `createContextMenuRequest`)
	const createEllipsisMenuRequest = Reflect.get(module, `createEllipsisMenuRequest`)

	assert.equal(
		typeof createContextMenuRequest,
		`function`,
		`createContextMenuRequest should preserve the row context-menu request`,
	)
	assert.equal(
		typeof createEllipsisMenuRequest,
		`function`,
		`createEllipsisMenuRequest should keep the row owner while anchoring to ellipsis bounds`,
	)

	return { createContextMenuRequest, createEllipsisMenuRequest } as PlayerMenuRequestsModule
}

async function loadPlayerInfinityMenu(): Promise<PlayerInfinityMenuModule> {
	const modulePath = `./playerInfinityMenu`
	const module = await import(modulePath).catch(() => ({}))
	const createPlayerInfinityMenu = Reflect.get(module, `createPlayerInfinityMenu`)
	const openPlayerInfinityMenu = Reflect.get(module, `openPlayerInfinityMenu`)

	assert.equal(
		typeof createPlayerInfinityMenu,
		`function`,
		`createPlayerInfinityMenu should provide one menu model for every player row`,
	)
	assert.equal(
		typeof openPlayerInfinityMenu,
		`function`,
		`openPlayerInfinityMenu should open the shared player menu`,
	)

	return { createPlayerInfinityMenu, openPlayerInfinityMenu } as PlayerInfinityMenuModule
}
