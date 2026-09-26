import assert from 'node:assert/strict'
import test from 'node:test'
import { get } from 'svelte/store'
import type { PlayerAction } from '$lib/core'
import { playDefaultButtonSfx } from '$lib/global/sfx/delegatedSfx'
import {
	closeInfinityMenu,
	infinityMenuState,
} from '../ui/infinityMenu'
import {
	createPlayerActionInfinityMenu,
	openPlayerActionInfinityMenu,
} from './playerActionInfinityMenu'

const now = new Date(`2026-08-26T12:00:00.000Z`)

test(`offense menu invokes only removal, active unban removal, and ID copying`, async () => {
  const ban = action()
  const calls: unknown[] = []
  const menu = createPlayerActionInfinityMenu(ban, [ban], {
    onRemove: value => { calls.push([`remove`, value.id]) },
    onUnban: value => { calls.push([`unban`, value.id]) },
    onCopyId: id => { calls.push([`copy`, id]) },
  }, now)
  for (const item of menu.items) if (typeof item.action === `function`) await item.action()
  assert.deepEqual(calls, [[`unban`, 9], [`remove`, 9], [`copy`, 9]])
})

test(`expired and non-ban offenses cannot invoke an unban`, async () => {
  for (const selected of [action({ duration: 1 }), action({ actionType: `kick` }), action({ isActiveBan: false })]) {
    const calls: unknown[] = []
    const menu = createPlayerActionInfinityMenu(selected, [selected], {
      onRemove: value => { calls.push([`remove`, value.id]) },
      onUnban: () => assert.fail(`Unban is unavailable`),
      onCopyId: id => { calls.push([`copy`, id]) },
    }, now)
    for (const item of menu.items) if (typeof item.action === `function`) await item.action()
    assert.deepEqual(calls, [[`remove`, 9], [`copy`, 9]])
  }
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
