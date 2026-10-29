import assert from "node:assert/strict"
import test from "node:test"
import { get } from "svelte/store"
import type { UserSession } from "$lib/core"
import type { ActivePage } from "$lib/types/ui"
import type { HelpView } from "./helpNotice"
import {
	closeInfinityMenu,
	infinityMenuState,
	positionInfinityMenu,
	type InfinityMenuAction,
} from "../ui/infinityMenu"

type AccountInfinityMenuTarget = {
	user: UserSession
	onSelectPage: (page: ActivePage) => void
	onLogout: () => Promise<void>
	onHelp: (view: HelpView) => void
	onCredits: () => void
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
	let creditsOpened = false

	openAccountInfinityMenu(menuEvent({} as HTMLElement, 0, 0), target({
		onSelectPage: page => selected.push(page),
		onHelp: view => helpViews.push(view),
		onCredits: () => { creditsOpened = true },
		onLogout: async () => {
			loggedOut = true
		},
	}))

	const items = get(infinityMenuState)?.menu.items ?? []
	for (const item of items) await run(item.action)

	assert.deepEqual(new Set(selected), new Set([`account`, `admin`]))
	assert.deepEqual(helpViews, [`onboarding`])
	assert.equal(loggedOut, true)
	assert.equal(creditsOpened, true)
	closeInfinityMenu()
})

test(`account menu offers admin navigation only to superadmins`, async () => {
	const { openAccountInfinityMenu } = await loadAccountInfinityMenu()
	for (const isSuperadmin of [false, true]) {
		const selected: ActivePage[] = []
		const account = target({ onSelectPage: page => selected.push(page) })
		account.user = { ...account.user, isSuperadmin }
		openAccountInfinityMenu(menuEvent({} as HTMLElement, 0, 0), account)
		for (const item of get(infinityMenuState)?.menu.items ?? []) await run(item.action)
		assert.equal(selected.includes(`admin`), isSuperadmin)
		closeInfinityMenu()
	}
})

test(`avatar clicks anchor the dropdown below the avatar`, async () => {
	const { openAccountInfinityMenu } = await loadAccountInfinityMenu()
	const owner = { getBoundingClientRect: () => ({ left: 80, top: 50, right: 180, bottom: 90, width: 100, height: 40 }) } as HTMLElement
	openAccountInfinityMenu(menuEvent(owner, 120, 75), target())
	const snapshot = get(infinityMenuState)
	assert.ok(snapshot)
	assert.deepEqual(positionInfinityMenu(snapshot, { width: 180, height: 140 }, { width: 500, height: 500 }), { x: 40, y: 94 })
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
			releaseCreationEnabled: false,
			onboardingComplete: true,
			isActive: true,
		},
		onSelectPage: () => {},
		onLogout: async () => {},
		onHelp: () => {},
		onCredits: () => {},
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
