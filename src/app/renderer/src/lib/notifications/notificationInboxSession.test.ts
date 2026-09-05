import assert from 'node:assert/strict'
import test from 'node:test'
import { get, writable, type Readable } from 'svelte/store'
import type { ChivServerApi, CoreCallResult } from '../core'
import type { NotificationPage, NotificationRecord } from '@spellbook/shared/notifications'
import { createNotificationInbox } from './notificationInbox'
import { NotificationEventBus } from './notificationEvents'
import { presentNotificationArrival } from './notificationPresentation'
import type { NotificationInboxState } from './notificationInbox'
import type { NotificationRequest } from './notificationTypes'

type Inbox = Readable<NotificationInboxState> & {
	start(): void
	stop(): void
	refresh(): Promise<void>
	setRead(id: number, read: boolean): Promise<void>
	remove(id: number): Promise<void>
}

type Session = Readable<NotificationInboxState> & {
	sync(userId: number | null): Promise<void>
	stop(): void
}

test('clears and stops the old session before a replacement lookup can settle', async () => {
	const createNotificationInboxSession = await loadCreateNotificationInboxSession()
	const replacements: Array<Deferred<Inbox>> = []
	const errors: string[] = []
	const session = createNotificationInboxSession(
		async () => {
			const replacement = deferred<Inbox>()
			replacements.push(replacement)
			return replacement.promise
		},
		(error) => errors.push(error instanceof Error ? error.message : String(error)),
	)
	const first = fakeInbox(state([7], 1))

	const startingFirst = session.sync(1)
	assert.equal(replacements.length, 1)
	replacements[0]?.resolve(first.inbox)
	await startingFirst
	assert.equal(first.starts, 1)
	assert.deepEqual(get(session), state([7], 1))

	const startingSecond = session.sync(2)
	assert.equal(first.stops, 1)
	assert.equal(first.unsubscribes, 1)
	assert.deepEqual(get(session), state([], 0))
	assert.equal(replacements.length, 2)

	replacements[1]?.reject(new Error('Poll config unavailable.'))
	await startingSecond
	assert.deepEqual(get(session), state([], 0))
	assert.deepEqual(errors, ['Poll config unavailable.'])
})

test('session replacement revokes a late old-user poll and clears its transient notifications', async () => {
	const createNotificationInboxSession = await loadCreateNotificationInboxSession()
	const bus = new NotificationEventBus() as NotificationEventBus & {
		clear(): void
		listen(listener: (request: { message: string }) => void, onClear: () => void): () => void
	}
	const toasts: string[] = []
	const stopListening = bus.listen(
		(request) => toasts.push(request.message),
		() => toasts.splice(0),
	)
	const requests: Array<Array<Deferred<CoreCallResult>>> = [[], []]
	const afterIds: Array<Array<number | undefined>> = [[], []]
	const inboxes: Inbox[] = []
	const arrivals: number[] = []
	let userIndex = 0
	const session = createNotificationInboxSession(
		async () => {
			const currentUserIndex = userIndex++
			const requestQueue = requests[currentUserIndex] ?? []
			const requestAfterIds = afterIds[currentUserIndex] ?? []
			const inbox = createNotificationInbox(notificationApi({
				list: async (afterId) => {
					requestAfterIds.push(afterId)
					const request = deferred<CoreCallResult>()
					requestQueue.push(request)
					return request.promise
				},
			}), 60_000, (item) => {
				arrivals.push(item.id)
				bus.emit({ message: item.title, level: 'info' })
			})
			inboxes.push(inbox)
			return inbox
		},
		() => {},
		() => bus.clear(),
	)

	await session.sync(1)
	await waitFor(() => requests[0]?.length === 1)
	requests[0]?.[0]?.resolve(ok(page([notification(1, 1)], 1, 1)))
	await waitFor(() => get(session).notifications.length === 1)
	bus.emit({ message: 'Existing old-user toast', level: 'info' })

	const oldRefresh = inboxes[0]?.refresh()
	await waitFor(() => requests[0]?.length === 2)
	await session.sync(2)
	await waitFor(() => requests[1]?.length === 1)
	requests[1]?.[0]?.resolve(ok(page([notification(20, 2)], 20, 1)))
	await waitFor(() => get(session).notifications[0]?.id === 20)

	requests[0]?.[1]?.resolve(ok(page([notification(2, 1)], 2, 99)))
	await oldRefresh
	const cursorProbe = inboxes[0]?.refresh()
	await waitFor(() => requests[0]?.length === 3)
	assert.deepEqual(afterIds[0], [undefined, 1, 1])
	requests[0]?.[2]?.resolve(ok(page([], 1, 1)))
	await cursorProbe

	assert.deepEqual(get(inboxes[0] as Inbox).notifications.map(({ id }) => id), [1])
	assert.deepEqual(get(session).notifications.map(({ id }) => id), [20])
	assert.equal(get(session).unreadCount, 1)
	assert.deepEqual(arrivals, [])
	assert.deepEqual(toasts, [])

	session.stop()
	stopListening()
})

test('session replacement revokes a delayed old-user toast and sound after presentation starts', async () => {
	const createNotificationInboxSession = await loadCreateNotificationInboxSession()
	const arrivalStarted = deferred<void>()
	const releaseArrival = deferred<void>()
	const notices: NotificationRequest[] = []
	const sounds: string[] = []
	const inboxes: Inbox[] = []
	const userPages = [
		[
			page([notification(1, 1)], 1, 1),
			page([notification(2, 1)], 2, 2),
		],
		[page([notification(20, 2)], 20, 1)],
	]
	let userIndex = 0
	const session = createNotificationInboxSession(
		async () => {
			const pages = userPages[userIndex++] ?? []
			const inbox = createNotificationInbox(
				notificationApi({ list: async () => ok(pages.shift() ?? page([], 0, 0)) }),
				60_000,
				async (item, context) => {
					arrivalStarted.resolve()
					await releaseArrival.promise
					presentNotificationArrival(item, {
						isCurrent: context?.isCurrent ?? (() => true),
						notify: (request) => notices.push(request),
						playSfx: (slug) => sounds.push(slug),
						setRead: async () => {},
						open: async () => {},
					})
				},
			)
			inboxes.push(inbox)
			return inbox
		},
		() => {},
		() => {
			notices.splice(0)
			sounds.splice(0)
		},
	)

	await session.sync(1)
	await waitFor(() => get(session).notifications[0]?.id === 1)
	const oldRefresh = inboxes[0]?.refresh()
	await arrivalStarted.promise
	notices.push({ message: 'Existing old-user toast', level: 'info' })

	await session.sync(2)
	assert.deepEqual(notices, [])
	assert.deepEqual(sounds, [])

	releaseArrival.resolve()
	await oldRefresh

	assert.deepEqual(notices, [])
	assert.deepEqual(sounds, [])
	session.stop()
})

async function loadCreateNotificationInboxSession(): Promise<(
	createInbox: () => Promise<Inbox>,
	onError: (error: unknown) => void,
	onReset?: () => void,
) => Session> {
	const modulePath = './notificationInboxSession'
	const module = await import(modulePath).catch(() => ({}))
	const factory = Reflect.get(module, 'createNotificationInboxSession')
	assert.equal(typeof factory, 'function')
	return factory as (
		createInbox: () => Promise<Inbox>,
		onError: (error: unknown) => void,
		onReset?: () => void,
	) => Session
}

function fakeInbox(initial: NotificationInboxState): {
	inbox: Inbox
	readonly starts: number
	readonly stops: number
	readonly unsubscribes: number
} {
	const store = writable(initial)
	let starts = 0
	let stops = 0
	let unsubscribes = 0
	return {
		inbox: {
			subscribe(run) {
				const unsubscribe = store.subscribe(run)
				return () => {
					unsubscribes += 1
					unsubscribe()
				}
			},
			start: () => {
				starts += 1
			},
			stop: () => {
				stops += 1
			},
			refresh: async () => {},
			setRead: async () => {},
			remove: async () => {},
		},
		get starts() {
			return starts
		},
		get stops() {
			return stops
		},
		get unsubscribes() {
			return unsubscribes
		},
	}
}

function state(ids: number[], unreadCount: number): NotificationInboxState {
	return {
		notifications: ids.map((id) => ({ id }) as NotificationInboxState['notifications'][number]),
		unreadCount,
		totalCount: ids.length,
		loading: false,
		error: null,
	}
}

type Deferred<T> = {
	promise: Promise<T>
	resolve(value: T): void
	reject(error: unknown): void
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void
	let reject!: (error: unknown) => void
	const promise = new Promise<T>((next, fail) => {
		resolve = next
		reject = fail
	})
	return { promise, resolve, reject }
}

function notificationApi(overrides: Partial<ChivServerApi['notifications']>): Pick<ChivServerApi, 'notifications'> {
	return {
		notifications: {
			list: async () => ok(page([], 0, 0)),
			setRead: async () => ok({ notification: notification(1, 1), unreadCount: 0, totalCount: 0 }),
			markAllRead: async () => ok({ unreadCount: 0, totalCount: 0 }),
			delete: async () => ok({ notification: notification(1, 1), unreadCount: 0, totalCount: 0 }),
			...overrides,
		},
	}
}

function notification(id: number, userId: number): NotificationRecord {
	return {
		id,
		userId,
		tone: 'custom',
		title: `Notification ${id}`,
		description: null,
		icon: null,
		source: 'test',
		content: {},
		meta: {},
		callback: null,
		readAt: null,
		deletedAt: null,
		createdAt: '2026-08-31T09:00:00.000Z',
		updatedAt: '2026-08-31T09:00:00.000Z',
	}
}

function page(notifications: NotificationRecord[], nextAfterId: number, unreadCount: number): NotificationPage {
	return { notifications, nextAfterId, unreadCount, totalCount: notifications.length }
}

function ok(data: unknown): CoreCallResult {
	return { ok: true, status: 200, statusText: 'OK', data }
}

async function waitFor(condition: () => boolean, timeoutMs = 500): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (!condition()) {
		if (Date.now() >= deadline) throw new Error('Timed out waiting for condition.')
		await new Promise((resolve) => setTimeout(resolve, 2))
	}
}
