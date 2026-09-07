import assert from "node:assert/strict"
import test from "node:test"
import { get } from "svelte/store"
import type { UserSession } from "$lib/core"
import type { ActivePage } from "$lib/types/ui"
import {
	closeInfinityMenu,
	updateInfinityMenuBadge,
	infinityMenuState,
	type InfinityMenuAction,
} from "../ui/infinityMenu"

type AccountInfinityMenuTarget = {
	user: UserSession
	pendingRequestCount?: number
	onSelectPage: (page: ActivePage) => void
	onLogout: () => Promise<void>
	onHelp: (view: `debug` | `onboarding`) => void
}

type AccountInfinityMenuModule = {
	openAccountInfinityMenu: (
		event: MouseEvent,
		target: AccountInfinityMenuTarget,
	) => void
}

test(`opens the account InfinityMenu at the avatar with the avatar as owner`, async () => {
	const { openAccountInfinityMenu } = await loadAccountInfinityMenu()
	const owner = {} as HTMLElement
	const click = menuEvent(owner, 24, 680)

	openAccountInfinityMenu(click, target())

	const snapshot = get(infinityMenuState)
	assert.equal(snapshot?.menu.name, `JohnChivalry`)
	assert.deepEqual(snapshot?.menu.items.map(item => item.name), [
		`Profile`,
		`Settings`,
		`My teams`,
		`Onboarding`,
		`Help`,
		`Logout`,
	])
	assert.deepEqual(snapshot?.position, { x: 24, y: 680 })
	assert.equal(snapshot?.owner, owner)
	assert.equal(click.prevented, true)
	assert.equal(click.stopped, true)
	closeInfinityMenu()
})

test(`routes account menu actions to their existing destinations`, async () => {
	const { openAccountInfinityMenu } = await loadAccountInfinityMenu()
	const selected: ActivePage[] = []
	const helpViews: string[] = []
	let loggedOut = false

	openAccountInfinityMenu(menuEvent({} as HTMLElement, 0, 0), target({
		onSelectPage: page => selected.push(page),
		onHelp: view => helpViews.push(view),
		onLogout: async () => {
			loggedOut = true
		},
	}))

	const items = get(infinityMenuState)?.menu.items ?? []
	for (const item of items) await run(item.action)

	assert.deepEqual(selected, [`account`, `settings`, `teams`])
	assert.deepEqual(helpViews, [`onboarding`, `debug`])
	assert.equal(loggedOut, true)
	closeInfinityMenu()
})

test(`puts pending requests on My teams without changing other menu destinations`, async () => {
	const { openAccountInfinityMenu } = await loadAccountInfinityMenu()
	openAccountInfinityMenu(menuEvent({} as HTMLElement, 0, 0), target({ pendingRequestCount: 3 }))
	const items = get(infinityMenuState)?.menu.items ?? []
	assert.equal(items.find(item => item.name === `My teams`)?.badge, 3)
	assert.ok(items.filter(item => item.name !== `My teams`).every(item => !item.badge))
	closeInfinityMenu()
})

test(`refreshes an open account badge without replacing its menu or another owner's menu`, async () => {
	const { openAccountInfinityMenu } = await loadAccountInfinityMenu()
	const owner = {} as HTMLElement
	openAccountInfinityMenu(menuEvent(owner, 0, 0), target({ pendingRequestCount: 3 }))
	const id = get(infinityMenuState)?.id
	updateInfinityMenuBadge({} as HTMLElement, `My teams`, 8)
	assert.equal(get(infinityMenuState)?.menu.items.find(item => item.name === `My teams`)?.badge, 3)
	updateInfinityMenuBadge(owner, `My teams`, 0)
	assert.equal(get(infinityMenuState)?.id, id)
	assert.equal(get(infinityMenuState)?.menu.items.find(item => item.name === `My teams`)?.badge, 0)
	closeInfinityMenu()
})

function target(overrides: Partial<AccountInfinityMenuTarget> = {}): AccountInfinityMenuTarget {
	return {
		user: {
			id: 7,
			discordId: `discord-7`,
			username: `JohnChivalry`,
			displayName: `JohnChivalry`,
			playfabId: `PF-7`,
			avatarUrl: `/avatars/7.webp`,
			isSuperadmin: true,
			wantedCreationEnabled: true,
			onboardingComplete: true,
			isActive: true,
		},
		onSelectPage: () => {},
		onLogout: async () => {},
		onHelp: () => {},
		...overrides,
	}
}

function menuEvent(
	currentTarget: HTMLElement,
	clientX: number,
	clientY: number,
): MouseEvent & { prevented: boolean; stopped: boolean } {
	const state = { prevented: false, stopped: false }

	return {
		currentTarget,
		clientX,
		clientY,
		get prevented() {
			return state.prevented
		},
		get stopped() {
			return state.stopped
		},
		preventDefault() {
			state.prevented = true
		},
		stopPropagation() {
			state.stopped = true
		},
	} as unknown as MouseEvent & { prevented: boolean; stopped: boolean }
}

async function run(action: InfinityMenuAction | undefined): Promise<void> {
	if (typeof action === `function`) await action()
}

async function loadAccountInfinityMenu(): Promise<AccountInfinityMenuModule> {
	const modulePath = `./accountInfinityMenu`
	const module = await import(modulePath).catch(() => ({}))
	const openAccountInfinityMenu = Reflect.get(module, `openAccountInfinityMenu`)

	assert.equal(
		typeof openAccountInfinityMenu,
		`function`,
		`openAccountInfinityMenu should open the avatar account menu`,
	)

	return { openAccountInfinityMenu } as AccountInfinityMenuModule
}
