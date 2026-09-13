import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { ServerProfileSummary } from '$lib/core'
import { closeInfinityMenu, infinityMenuState, type InfinityMenuItem, type InfinityMenuLevel } from '$lib/components/ui/infinityMenu'

type ProfileMenuModule = {
	createProfileMenu: (target: ProfileMenuTarget) => InfinityMenuLevel
	openProfileMenu: (event: MenuEvent, target: ProfileMenuTarget) => void
}

type ProfileMenuTarget = {
	summary: ServerProfileSummary
	canDuplicate: boolean
	busy?: boolean
	onOpen: () => void
	onDuplicate: () => void | Promise<void>
	onSetEnabled: (isEnabled: boolean) => void | Promise<void>
}

type MenuEvent = Pick<MouseEvent, `clientX` | `clientY` | `preventDefault` | `stopPropagation`> & {
	currentTarget: HTMLElement
}

test(`builds open, duplicate, and account enablement actions from profile permissions`, async () => {
	const { createProfileMenu } = await loadProfileMenu()
	const calls: string[] = []
	const target = menuTarget(calls)
	const menu = createProfileMenu(target)

	assert.deepEqual(menu.items.map(item => item.name), [`Open`, `Duplicate`, `Disable for me`])
	assert.equal(itemNamed(menu.items, `Duplicate`).disabled, false)
	await runItem(itemNamed(menu.items, `Open`))
	await runItem(itemNamed(menu.items, `Duplicate`))
	await runItem(itemNamed(menu.items, `Disable for me`))
	assert.deepEqual(calls, [`open`, `duplicate`, `enabled:false`])

	const readOnly = createProfileMenu({ ...target, canDuplicate: false })
	assert.equal(itemNamed(readOnly.items, `Duplicate`).disabled, true)
	assert.equal(itemNamed(readOnly.items, `Disable for me`).disabled, false)
})

test(`defaults missing preferences to enabled and switches the action after disabling`, async () => {
	const { createProfileMenu } = await loadProfileMenu()
	const calls: string[] = []
	const disabled = createProfileMenu(menuTarget(calls, { isEnabledForUser: false }))

	assert.deepEqual(disabled.items.map(item => item.name), [`Open`, `Duplicate`, `Enable for me`])
	await runItem(itemNamed(disabled.items, `Enable for me`))
	assert.deepEqual(calls, [`enabled:true`])
})

test(`does not offer account enablement for Default and disables submissions while busy`, async () => {
	const { createProfileMenu } = await loadProfileMenu()
	const calls: string[] = []
	const defaultMenu = createProfileMenu(menuTarget(calls, { isDefault: true }))
	assert.deepEqual(defaultMenu.items.map(item => item.name), [`Open`, `Duplicate`])

	const busyMenu = createProfileMenu({ ...menuTarget(calls), busy: true })
	assert.equal(itemNamed(busyMenu.items, `Duplicate`).disabled, true)
	assert.equal(itemNamed(busyMenu.items, `Disable for me`).disabled, true)
})

test(`opens the same menu from a row or ellipsis and keeps the row as menu owner`, async () => {
	const { openProfileMenu } = await loadProfileMenu()
	const row = element(null, { right: 500, bottom: 300 })
	const ellipsis = element(row, { right: 480, bottom: 280 })
	const calls: string[] = []

	const contextEvent = menuEvent(row, 120, 140)
	openProfileMenu(contextEvent, menuTarget(calls))
	assert.equal(get(infinityMenuState)?.owner, row)
	assert.deepEqual(get(infinityMenuState)?.position, { x: 120, y: 140 })
	assert.equal(contextEvent.prevented, true)
	assert.equal(contextEvent.stopped, true)

	const ellipsisEvent = menuEvent(ellipsis, 0, 0)
	openProfileMenu(ellipsisEvent, menuTarget(calls))
	assert.equal(get(infinityMenuState)?.owner, row)
	assert.deepEqual(get(infinityMenuState)?.position, { x: 480, y: 280 })
	assert.equal(ellipsisEvent.prevented, true)
	assert.equal(ellipsisEvent.stopped, true)
	closeInfinityMenu()
})

function menuTarget(calls: string[], overrides: { isDefault?: boolean, isEnabledForUser?: boolean } = {}): ProfileMenuTarget {
	return {
		summary: {
			profile: {
				id: 12,
				owner: overrides.isDefault ? { type: `system`, id: 0 } : { type: `team`, id: 6 },
				name: overrides.isDefault ? `Default` : `Clan`,
				description: null,
				isDefault: overrides.isDefault ?? false,
			},
			serverCount: 0,
			serverIds: [],
			actionCount: 0,
			enabledActionCount: 0,
			commandCount: 0,
			...(overrides.isEnabledForUser === undefined ? {} : { isEnabledForUser: overrides.isEnabledForUser }),
		},
		canDuplicate: true,
		onOpen: () => { calls.push(`open`) },
		onDuplicate: () => { calls.push(`duplicate`) },
		onSetEnabled: isEnabled => { calls.push(`enabled:${isEnabled}`) },
	}
}

function itemNamed(items: InfinityMenuItem[], name: string): InfinityMenuItem {
	const item = items.find(candidate => candidate.name === name)
	assert.ok(item, `expected ${name} menu item`)
	return item
}

async function runItem(item: InfinityMenuItem): Promise<void> {
	assert.equal(typeof item.action, `function`)
	if (typeof item.action === `function`) await item.action()
}

function element(row: HTMLElement | null, rect: Pick<DOMRect, `right` | `bottom`>): HTMLElement {
	const node = {} as HTMLElement
	node.getBoundingClientRect = () => rect as DOMRect
	node.closest = ((selector: string) => selector === `[data-profile-summary]` ? row : null) as typeof node.closest
	return node
}

function menuEvent(currentTarget: HTMLElement, clientX: number, clientY: number) {
	return {
		currentTarget,
		clientX,
		clientY,
		prevented: false,
		stopped: false,
		preventDefault() { this.prevented = true },
		stopPropagation() { this.stopped = true },
	}
}

async function loadProfileMenu(): Promise<ProfileMenuModule> {
	const modulePath = `./profileMenu`
	const module = await import(modulePath).catch(() => ({}))
	assert.equal(typeof Reflect.get(module, `createProfileMenu`), `function`, `profile menus should expose permission-aware actions`)
	assert.equal(typeof Reflect.get(module, `openProfileMenu`), `function`, `profile rows should share one menu opener`)
	return module as ProfileMenuModule
}
