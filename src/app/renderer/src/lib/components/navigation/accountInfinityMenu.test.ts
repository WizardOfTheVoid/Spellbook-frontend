import assert from "node:assert/strict"
import test from "node:test"
import { get } from "svelte/store"
import type { UserSession } from "$lib/core"
import type { ActivePage } from "$lib/types/ui"
import {
	closeInfinityMenu,
	infinityMenuState,
	type InfinityMenuAction,
} from "../ui/infinityMenu"

type AccountInfinityMenuTarget = {
	user: UserSession
	onSelectPage: (page: ActivePage) => void
	onLogout: () => Promise<void>
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
	let loggedOut = false

	openAccountInfinityMenu(menuEvent({} as HTMLElement, 0, 0), target({
		onSelectPage: page => selected.push(page),
		onLogout: async () => {
			loggedOut = true
		},
	}))

	const items = get(infinityMenuState)?.menu.items ?? []
	for (const item of items) await run(item.action)

	assert.deepEqual(selected, [`account`, `settings`, `teams`])
	assert.equal(loggedOut, true)
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
		},
		onSelectPage: () => {},
		onLogout: async () => {},
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
