import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { PlayerAction } from '$lib/core'
import { playDefaultButtonSfx } from '$lib/global/sfx/delegatedSfx'
import { notificationEvents } from '$lib/notifications/notificationEvents'
import {
	closeInfinityMenu,
	infinityMenuState,
} from '../ui/infinityMenu'
import {
	createPlayerActionInfinityMenu,
	openPlayerActionInfinityMenu,
} from './playerActionInfinityMenu'

const now = new Date(`2026-08-26T12:00:00.000Z`)

test(`offers Unban and player-owned Notes with a total for an eligible ban`, async () => {
	const ban = action()
	const calls: string[] = []
	const notices: string[] = []
	const stop = notificationEvents.listen(notice => notices.push(notice.message))
	const menu = createPlayerActionInfinityMenu(ban, [ban], {
		gameAvailable: true,
		onUnban: value => {
			calls.push(`unban:${value.id}`)
		},
		onOpenNotes: playerId => {
			calls.push(`notes:${playerId}`)
		},
		noteCount: 23,
	}, now)

	try {
		assert.deepEqual(menu.items.map(item => [item.name, item.suffix]), [[`Unban`, undefined], [`Notes`, `(23)`]])
		for (const item of menu.items) {
			if (typeof item.action === `function`) await item.action()
		}
		assert.deepEqual(calls, [`unban:9`, `notes:42`])
		assert.deepEqual(notices, [])
	} finally {
		stop()
	}
})

test(`keeps action-level Unban visible but disabled without the game process`, () => {
	const menu = createPlayerActionInfinityMenu(action(), [action()], { gameAvailable: false }, now)
	assert.equal(menu.items[0]?.name, `Unban`)
	assert.equal(menu.items[0]?.disabled, true)
	assert.equal(menu.items[0]?.tooltip, `Chivalry 2 must be running.`)
})

test(`does not emit the retired WIP notice without an unban callback`, async () => {
	const notices: string[] = []
	const stop = notificationEvents.listen(notice => notices.push(notice.message))
	const item = createPlayerActionInfinityMenu(action(), [action()], {}, now).items[0]

	try {
		assert.equal(typeof item.action, `function`)
		if (typeof item.action === `function`) await item.action()
		assert.deepEqual(notices, [])
	} finally {
		stop()
	}
})

test(`known active Wanted state removes the action-level generic Unban`, () => {
	const menu = createPlayerActionInfinityMenu(action(), [action()], { hasActiveWanted: true }, now)
	assert.deepEqual(menu.items.map(item => item.name), [`Notes`])
})

test(`offers only player-owned Notes for expired, related-unbanned, and non-ban actions`, () => {
	const expired = action({ duration: 1, createdAt: `2026-08-26T10:00:00.000Z` })
	const ban = action()
	const unban = action({ id: 10, actionType: `unban`, offenseType: null, relatedActionId: ban.id })

	assert.deepEqual(
		createPlayerActionInfinityMenu(expired, [expired], {}, now).items.map(item => item.name),
		[`Notes`],
	)
	assert.deepEqual(
		createPlayerActionInfinityMenu(ban, [ban, unban], {}, now).items.map(item => item.name),
		[`Notes`],
	)
	assert.deepEqual(
		createPlayerActionInfinityMenu(unban, [ban, unban], {}, now).items.map(item => item.name),
		[`Notes`],
	)
})

test(`opens action items from the tag edge or context pointer with one stopped cue`, () => {
	const target = element({ right: 420, bottom: 180 })
	const click = menuEvent(`click`, target, 11, 22)
	const contextMenu = menuEvent(`contextmenu`, target, 320, 240)
	const selected = action()
	let opened = 0

	openPlayerActionInfinityMenu(click, selected, [selected], {}, () => (opened += 1))
	playDefaultButtonSfx(target as unknown as Element, () => (opened += 1))

	assert.equal(opened, 1)
	assert.equal(click.prevented, true)
	assert.equal(click.stopped, true)
	assert.deepEqual(get(infinityMenuState)?.position, { x: 420, y: 180 })

	openPlayerActionInfinityMenu(contextMenu, selected, [selected], {}, () => (opened += 1))
	playDefaultButtonSfx(target as unknown as Element, () => (opened += 1))

	assert.equal(opened, 2)
	assert.equal(contextMenu.prevented, true)
	assert.equal(contextMenu.stopped, true)
	assert.deepEqual(get(infinityMenuState)?.position, { x: 320, y: 240 })

	closeInfinityMenu()
})

function action(overrides: Partial<PlayerAction> = {}): PlayerAction {
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
		createdAt: `2026-08-26T10:00:00.000Z`,
		updatedAt: `2026-08-26T10:00:00.000Z`,
		author: { id: 3, username: `Admin`, playfabId: null },
		gameServer: { id: 7, name: `Duel`, displayName: null },
		...overrides,
	}
}

function element(rect: Pick<DOMRect, `right` | `bottom`>): HTMLElement {
	const target = {} as HTMLElement
	target.getBoundingClientRect = () => rect as DOMRect
	target.closest = (selector: string) => selector === `button` ? target : null
	target.hasAttribute = (name: string) => name === `data-uisfx-ignore`
	return target
}

function menuEvent(
	type: `click` | `contextmenu`,
	currentTarget: HTMLElement,
	clientX: number,
	clientY: number,
): MouseEvent & { prevented: boolean; stopped: boolean } {
	const event = {
		type,
		currentTarget,
		clientX,
		clientY,
		prevented: false,
		stopped: false,
		preventDefault: () => {
			event.prevented = true
		},
		stopPropagation: () => {
			event.stopped = true
		},
	}

	return event as unknown as MouseEvent & { prevented: boolean; stopped: boolean }
}
