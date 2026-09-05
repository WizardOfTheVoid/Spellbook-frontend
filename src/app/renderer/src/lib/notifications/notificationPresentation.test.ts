import assert from "node:assert/strict"
import test from "node:test"
import type { ChivServerApi, CoreCallResult } from "../core.js"
import {
	type NotificationMutation,
	type NotificationPage,
	wantedExecutionNotificationSource,
	type NotificationRecord,
} from "@spellbook/shared/notifications.js"
import { createNotificationInbox } from "./notificationInbox.js"
import type { NotificationRequest } from "./notificationTypes.js"

type Presentation = {
	title: string
	description: string | null
	icon: string | null
	iconType: `light` | `brands`
	callbackLabel: string | null
	read: boolean
	createdAt: string
}

type PresentationModule = {
	notificationPresentation?: (notification: NotificationRecord) => Presentation
	notificationSfx?: (source: string) => `notification` | `wanted-notification`
	presentNotificationArrival?: (
		notification: NotificationRecord,
		ports: {
			isCurrent(): boolean
			notify(request: NotificationRequest): void
			playSfx(slug: `notification` | `wanted-notification`): void
			setRead(id: number, read: boolean): Promise<void>
			open(notification: NotificationRecord): Promise<void>
		},
	) => void
}

test(`presents durable notification text and optional fields without changing display text`, async () => {
	const presentation = (await loadPresentation()).notificationPresentation
	assert.ok(presentation)

	assert.deepEqual(presentation(notification()), {
		title: `Ångström 玩家 [Ω]`,
		description: `Original player: 李雷`,
		icon: `fa-user-secret`,
		iconType: `light`,
		callbackLabel: `Open player`,
		read: true,
		createdAt: `2026-08-31T10:15:00.000Z`,
	})
	assert.deepEqual(presentation(notification({
		description: null,
		icon: null,
		callback: null,
		readAt: null,
	})), {
		title: `Ångström 玩家 [Ω]`,
		description: null,
		icon: null,
		iconType: `light`,
		callbackLabel: null,
		read: false,
		createdAt: `2026-08-31T10:15:00.000Z`,
	})
	assert.equal(presentation(notification({ icon: `fa-discord` })).iconType, `brands`)
})

test(`selects the Wanted execution cue only for its exact notification source`, async () => {
	const notificationSfx = (await loadPresentation()).notificationSfx
	assert.ok(notificationSfx)

	assert.equal(notificationSfx(wantedExecutionNotificationSource), `wanted-notification`)
	for (const source of [``, `admin-notification-test`, `wanted-executions`]) {
		assert.equal(notificationSfx(source), `notification`)
	}
})

test(`emits one custom-tone toast and sound whose CTA persists read state before navigation`, async () => {
	const presentArrival = (await loadPresentation()).presentNotificationArrival
	assert.ok(presentArrival)

	const notices: NotificationRequest[] = []
	const sounds: string[] = []
	const events: string[] = []
	const read = deferred()
	const record = notification({ tone: `custom` })

	presentArrival(record, {
		isCurrent: () => true,
		notify: (request) => notices.push(request),
		playSfx: (slug) => sounds.push(slug),
		setRead: async (id, value) => {
			events.push(`read:${id}:${value}`)
			await read.promise
		},
		open: async (opened) => {
			events.push(`open:${opened.id}`)
		},
	})

	assert.equal(notices.length, 1)
	assert.equal(sounds.length, 1)
	assert.deepEqual(sounds, [`notification`])
	assert.equal(notices[0]?.message, `Ångström 玩家 [Ω]`)
	assert.equal(notices[0]?.level, `info`)
	assert.equal(notices[0]?.dedupeKey, `durable-notification:42`)
	assert.equal(notices[0]?.action?.label, `Open player`)

	const opening = notices[0]?.action?.onClick()
	assert.ok(opening instanceof Promise)
	await Promise.resolve()
	assert.deepEqual(events, [`read:42:true`])
	read.resolve()
	await opening
	assert.deepEqual(events, [`read:42:true`, `open:42`])
})

test(`does not emit toast or sound for an arrival canceled before presentation`, async () => {
	const presentArrival = (await loadPresentation()).presentNotificationArrival
	assert.ok(presentArrival)
	const notices: NotificationRequest[] = []
	const sounds: string[] = []

	presentArrival(notification(), {
		isCurrent: () => false,
		notify: (request) => notices.push(request),
		playSfx: (slug) => sounds.push(slug),
		setRead: async () => {},
		open: async () => {},
	})

	assert.deepEqual(notices, [])
	assert.deepEqual(sounds, [])
})

test(`rechecks a re-entrant reset after toast emission before playing sound`, async () => {
	const presentArrival = (await loadPresentation()).presentNotificationArrival
	assert.ok(presentArrival)
	const notices: NotificationRequest[] = []
	const sounds: string[] = []
	let current = true

	presentArrival(notification(), {
		isCurrent: () => current,
		notify: (request) => {
			notices.push(request)
			current = false
			notices.splice(0)
		},
		playSfx: (slug) => sounds.push(slug),
		setRead: async () => {},
		open: async () => {},
	})

	assert.deepEqual(notices, [])
	assert.deepEqual(sounds, [])
})

test(`does not run a stale toast CTA against a replacement inbox`, async () => {
	const presentArrival = (await loadPresentation()).presentNotificationArrival
	assert.ok(presentArrival)
	const notices: NotificationRequest[] = []
	let current = true
	let readCalls = 0
	let openCalls = 0

	presentArrival(notification(), {
		isCurrent: () => current,
		notify: (request) => notices.push(request),
		playSfx: () => {},
		setRead: async () => { readCalls += 1 },
		open: async () => { openCalls += 1 },
	})
	current = false
	await notices[0]?.action?.onClick()

	assert.equal(readCalls, 0)
	assert.equal(openCalls, 0)
})

test(`does not open a notification CTA when its in-flight read is canceled by stop`, async () => {
	const presentArrival = (await loadPresentation()).presentNotificationArrival
	assert.ok(presentArrival)
	const record = notification({ readAt: null })
	const read = deferredResult<CoreCallResult>()
	let readCalls = 0
	let openCalls = 0
	const inbox = createNotificationInbox(notificationApi({
		list: async () => ok(page([record], record.id, 1)),
		setRead: async () => {
			readCalls += 1
			return read.promise
		},
	}), 60_000, () => {})
	await inbox.refresh()
	const notices: NotificationRequest[] = []

	presentArrival(record, {
		isCurrent: () => true,
		notify: (request) => notices.push(request),
		playSfx: () => {},
		setRead: inbox.setRead,
		open: async () => { openCalls += 1 },
	})
	const opening = notices[0]?.action?.onClick()
	assert.ok(opening instanceof Promise)
	await waitFor(() => readCalls === 1)
	inbox.stop()
	read.resolve(ok({
		notification: { ...record, readAt: `2026-08-31T10:17:00.000Z` },
		unreadCount: 0,
		totalCount: 1,
	} satisfies NotificationMutation))

	await assert.rejects(opening, /canceled/i)
	assert.equal(openCalls, 0)
})

async function loadPresentation(): Promise<PresentationModule> {
	return import(`./notificationPresentation.js`).catch(() => ({}))
}

function notification(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
	return {
		id: 42,
		userId: 7,
		tone: `success`,
		title: `Ångström 玩家 [Ω]`,
		description: `Original player: 李雷`,
		icon: `fa-user-secret`,
		source: `player-action`,
		content: {},
		meta: {},
		callback: { label: `Open player`, uri: `/wanted/ABC123` },
		readAt: `2026-08-31T10:16:00.000Z`,
		deletedAt: null,
		createdAt: `2026-08-31T10:15:00.000Z`,
		updatedAt: `2026-08-31T10:16:00.000Z`,
		...overrides,
	}
}

function deferred(): { promise: Promise<void>, resolve(): void } {
	let resolve = () => {}
	const promise = new Promise<void>((done) => {
		resolve = done
	})
	return { promise, resolve }
}

function notificationApi(overrides: Partial<ChivServerApi[`notifications`]>): Pick<ChivServerApi, `notifications`> {
	return {
		notifications: {
			list: async () => ok(page([], 0, 0)),
			setRead: async () => ok({ notification: notification(), unreadCount: 0, totalCount: 0 }),
			markAllRead: async () => ok({ unreadCount: 0, totalCount: 0 }),
			delete: async () => ok({ notification: notification(), unreadCount: 0, totalCount: 0 }),
			...overrides,
		},
	}
}

function page(notifications: NotificationRecord[], nextAfterId: number, unreadCount: number): NotificationPage {
	return { notifications, nextAfterId, unreadCount, totalCount: notifications.length }
}

function ok(data: unknown): CoreCallResult {
	return { ok: true, status: 200, statusText: `OK`, data }
}

function deferredResult<T>(): { promise: Promise<T>, resolve(value: T): void } {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((done) => { resolve = done })
	return { promise, resolve }
}

async function waitFor(condition: () => boolean, timeoutMs = 500): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (!condition()) {
		if (Date.now() >= deadline) throw new Error(`Timed out waiting for condition.`)
		await new Promise((resolve) => setTimeout(resolve, 2))
	}
}
