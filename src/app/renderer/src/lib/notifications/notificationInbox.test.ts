import assert from 'node:assert/strict'
import test from 'node:test'
import { get, type Readable } from 'svelte/store'
import type { ChivServerApi, CoreCallResult } from '../core'
import type { NotificationMutation, NotificationPage, NotificationRecord } from '@spellbook/shared/notifications'

type InboxState = {
	notifications: NotificationRecord[]
	unreadCount: number
	totalCount: number
	loading: boolean
	error: string | null
}

type Inbox = Readable<InboxState> & {
	start(): void
	stop(): void
	refresh(): Promise<void>
	setRead(id: number, read: boolean): Promise<void>
	markAllRead(): Promise<void>
	remove(id: number): Promise<void>
}

type ArrivalContext = {
	isCurrent(): boolean
}

test('hydrates without arrivals, then advances the cursor with only unseen notifications', async () => {
	const createNotificationInbox = await loadCreateNotificationInbox()
	const arrivals: number[] = []
	const listCalls: Array<number | undefined> = []
	const pages = [
		page([notification(1), notification(2)], 2, 2),
		page([notification(2), notification(3), notification(3)], 3, 3),
	]
	const api = notificationApi({
		list: async (afterId) => {
			listCalls.push(afterId)
			return ok(pages.shift())
		},
	})
	const inbox = createNotificationInbox(api, 60_000, (item) => {
		arrivals.push(item.id)
	})

	inbox.start()
	await waitFor(() => get(inbox).notifications.length === 2)

	assert.deepEqual(listCalls, [undefined])
	assert.deepEqual(arrivals, [])
	assert.deepEqual(get(inbox), {
		notifications: [notification(1), notification(2)],
		unreadCount: 2,
		totalCount: 2,
		loading: false,
		error: null,
	})

	await inbox.refresh()

	assert.deepEqual(listCalls, [undefined, 2])
	assert.deepEqual(get(inbox).notifications.map(({ id }) => id), [1, 2, 3])
	assert.equal(get(inbox).unreadCount, 3)
	assert.deepEqual(arrivals, [3])
	inbox.stop()
})

test('continues presenting later arrivals when one presenter throws', async () => {
	const createNotificationInbox = await loadCreateNotificationInbox()
	const arrivals: number[] = []
	const pages = [
		page([notification(1)], 1, 1),
		page([notification(2), notification(3)], 3, 3),
	]
	const inbox = createNotificationInbox(
		notificationApi({ list: async () => ok(pages.shift()) }),
		60_000,
		(item) => {
			arrivals.push(item.id)
			if (item.id === 2) throw new Error('Presenter failed.')
		},
	)

	await inbox.refresh()
	await inbox.refresh()

	assert.deepEqual(arrivals, [2, 3])
	assert.deepEqual(get(inbox).notifications.map(({ id }) => id), [1, 2, 3])
	assert.equal(get(inbox).error, null)
})

test('awaits and isolates each asynchronous presenter before starting the next arrival', async () => {
	const createNotificationInbox = await loadCreateNotificationInbox()
	const firstArrival = deferred<void>()
	const started: number[] = []
	const presented: number[] = []
	const pages = [
		page([notification(1)], 1, 1),
		page([notification(2), notification(3)], 3, 3),
	]
	const inbox = createNotificationInbox(
		notificationApi({ list: async () => ok(pages.shift()) }),
		60_000,
		async (item) => {
			started.push(item.id)
			if (item.id === 2) {
				await firstArrival.promise
				throw new Error('Async presenter failed.')
			}
			presented.push(item.id)
		},
	)

	await inbox.refresh()
	const refreshing = inbox.refresh()
	await waitFor(() => started[0] === 2)

	assert.deepEqual(started, [2])
	assert.deepEqual(presented, [])
	firstArrival.resolve()
	await refreshing

	assert.deepEqual(started, [2, 3])
	assert.deepEqual(presented, [3])
	assert.equal(get(inbox).error, null)
})

test('revokes a delayed presenter capability when the inbox is stopped', async () => {
	const createNotificationInbox = await loadCreateNotificationInbox()
	const arrivalStarted = deferred<void>()
	const releaseArrival = deferred<void>()
	const effects: number[] = []
	const pages = [
		page([notification(1)], 1, 1),
		page([notification(2)], 2, 2),
	]
	const inbox = createNotificationInbox(
		notificationApi({ list: async () => ok(pages.shift()) }),
		60_000,
		async (item, context) => {
			arrivalStarted.resolve()
			await releaseArrival.promise
			if (context?.isCurrent() ?? true) effects.push(item.id)
		},
	)

	await inbox.refresh()
	const refreshing = inbox.refresh()
	await arrivalStarted.promise
	inbox.stop()
	releaseArrival.resolve()
	await refreshing

	assert.deepEqual(effects, [])
})

test('stops presenting the remaining arrivals when a presenter revokes the inbox lifecycle', async () => {
	const createNotificationInbox = await loadCreateNotificationInbox()
	const arrivals: number[] = []
	const pages = [
		page([notification(1)], 1, 1),
		page([notification(2), notification(3)], 3, 3),
	]
	let inbox!: Inbox
	inbox = createNotificationInbox(
		notificationApi({ list: async () => ok(pages.shift()) }),
		60_000,
		(item) => {
			arrivals.push(item.id)
			if (item.id === 2) inbox.stop()
		},
	)

	await inbox.refresh()
	await inbox.refresh()

	assert.deepEqual(arrivals, [2])
})

test('runs one request at a time, schedules after completion, and cancels on stop', async () => {
	const createNotificationInbox = await loadCreateNotificationInbox()
	const requests: Array<Deferred<CoreCallResult>> = []
	let inFlight = 0
	let maxInFlight = 0
	const api = notificationApi({
		list: async () => {
			inFlight += 1
			maxInFlight = Math.max(maxInFlight, inFlight)
			const request = deferred<CoreCallResult>()
			requests.push(request)
			return request.promise.finally(() => {
				inFlight -= 1
			})
		},
	})
	const inbox = createNotificationInbox(api, 10, () => {})

	inbox.start()
	inbox.start()
	await waitFor(() => requests.length === 1)
	await delay(25)
	assert.equal(requests.length, 1)

	requests[0]?.resolve(ok(page([], 0, 0)))
	await waitFor(() => requests.length === 2)
	assert.equal(maxInFlight, 1)

	inbox.stop()
	requests[1]?.resolve(ok(page([], 0, 0)))
	await delay(25)
	assert.equal(requests.length, 2)
})

test('retains the last good inbox after failure and remains refreshable', async () => {
	const createNotificationInbox = await loadCreateNotificationInbox()
	const results = [
		ok(page([notification(4)], 4, 1)),
		failed('Polling failed.'),
		ok(page([notification(5)], 5, 2)),
	]
	const api = notificationApi({ list: async () => results.shift() as CoreCallResult })
	const inbox = createNotificationInbox(api, 60_000, () => {})

	await inbox.refresh()
	await assert.rejects(inbox.refresh(), /Polling failed\./)

	assert.deepEqual(get(inbox).notifications.map(({ id }) => id), [4])
	assert.equal(get(inbox).unreadCount, 1)
	assert.equal(get(inbox).loading, false)
	assert.equal(get(inbox).error, 'Polling failed.')

	await inbox.refresh()
	assert.deepEqual(get(inbox).notifications.map(({ id }) => id), [4, 5])
	assert.equal(get(inbox).unreadCount, 2)
	assert.equal(get(inbox).error, null)
})

test('reconciles read and delete mutations with authoritative records and counts', async () => {
	const createNotificationInbox = await loadCreateNotificationInbox()
	const first = notification(8)
	const second = notification(9)
	const read = { ...first, readAt: '2026-08-31T10:00:00.000Z' }
	const deleted = { ...second, deletedAt: '2026-08-31T10:01:00.000Z' }
	const setReadCalls: Array<[number, boolean]> = []
	const deleteCalls: number[] = []
	const api = notificationApi({
		list: async () => ok(page([first, second], 9, 2)),
		setRead: async (id, value) => {
			setReadCalls.push([id, value])
			return ok({ notification: read, unreadCount: 7, totalCount: 9 } satisfies NotificationMutation)
		},
		delete: async (id) => {
			deleteCalls.push(id)
			return ok({ notification: deleted, unreadCount: 5, totalCount: 8 } satisfies NotificationMutation)
		},
	})
	const inbox = createNotificationInbox(api, 60_000, () => {})
	await inbox.refresh()

	await inbox.setRead(8, true)
	assert.deepEqual(setReadCalls, [[8, true]])
	assert.deepEqual(get(inbox).notifications, [read, second])
	assert.equal(get(inbox).unreadCount, 7)
	assert.equal(get(inbox).totalCount, 9)

	await inbox.remove(9)
	assert.deepEqual(deleteCalls, [9])
	assert.deepEqual(get(inbox).notifications, [read])
	assert.equal(get(inbox).unreadCount, 5)
	assert.equal(get(inbox).totalCount, 8)
})

test('marks the hydrated inbox read using authoritative counts', async () => {
	const createNotificationInbox = await loadCreateNotificationInbox()
	const api = notificationApi({
		list: async () => ok({ ...page([notification(8), notification(9)], 9, 2), totalCount: 33 }),
		markAllRead: async () => ok({ unreadCount: 0, totalCount: 33 }),
	})
	const inbox = createNotificationInbox(api, 60_000, () => {})
	await inbox.refresh()

	await inbox.markAllRead()

	assert.equal(get(inbox).unreadCount, 0)
	assert.equal(get(inbox).totalCount, 33)
	assert.ok(get(inbox).notifications.every(({ readAt }) => readAt !== null))
})

test('does not let an older refresh restore state after a mutation completes', async () => {
	const createNotificationInbox = await loadCreateNotificationInbox()
	const staleRefresh = deferred<CoreCallResult>()
	let listCalls = 0
	const api = notificationApi({
		list: async () => {
			listCalls += 1
			return listCalls === 1
				? ok(page([notification(8), notification(9)], 9, 2))
				: staleRefresh.promise
		},
		delete: async () => ok({
			notification: { ...notification(9), deletedAt: '2026-08-31T10:01:00.000Z' },
			unreadCount: 1,
		}),
	})
	const inbox = createNotificationInbox(api, 60_000, () => {})
	await inbox.refresh()

	const refreshing = inbox.refresh()
	await waitFor(() => listCalls === 2)
	await inbox.remove(9)
	assert.deepEqual(get(inbox).notifications.map(({ id }) => id), [8])
	assert.equal(get(inbox).unreadCount, 1)

	staleRefresh.resolve(ok(page([notification(9), notification(10)], 10, 3)))
	await refreshing
	assert.deepEqual(get(inbox).notifications.map(({ id }) => id), [8])
	assert.equal(get(inbox).unreadCount, 1)
})

test('serializes mutations so an older response cannot regress the unread count', async () => {
	const createNotificationInbox = await loadCreateNotificationInbox()
	const firstMutation = deferred<CoreCallResult>()
	const secondMutation = deferred<CoreCallResult>()
	let setReadCalls = 0
	let deleteCalls = 0
	const api = notificationApi({
		list: async () => ok(page([notification(8), notification(9)], 9, 2)),
		setRead: async () => {
			setReadCalls += 1
			return firstMutation.promise
		},
		delete: async () => {
			deleteCalls += 1
			return secondMutation.promise
		},
	})
	const inbox = createNotificationInbox(api, 60_000, () => {})
	await inbox.refresh()

	const settingRead = inbox.setRead(8, true)
	const removing = inbox.remove(9)
	await waitFor(() => setReadCalls === 1)
	assert.equal(deleteCalls, 0)

	firstMutation.resolve(ok({
		notification: { ...notification(8), readAt: '2026-08-31T10:00:00.000Z' },
		unreadCount: 1,
	}))
	await settingRead
	await waitFor(() => deleteCalls === 1)
	secondMutation.resolve(ok({
		notification: { ...notification(9), deletedAt: '2026-08-31T10:01:00.000Z' },
		unreadCount: 0,
	}))
	await removing

	assert.equal(get(inbox).unreadCount, 0)
	assert.deepEqual(get(inbox).notifications.map(({ id }) => id), [8])
})

test('stop cancels in-flight and queued mutations before another API call or state change', async () => {
	const createNotificationInbox = await loadCreateNotificationInbox()
	const firstMutation = deferred<CoreCallResult>()
	let setReadCalls = 0
	let deleteCalls = 0
	const api = notificationApi({
		list: async () => ok(page([notification(8), notification(9)], 9, 2)),
		setRead: async () => {
			setReadCalls += 1
			return firstMutation.promise
		},
		delete: async () => {
			deleteCalls += 1
			return ok({
				notification: { ...notification(9), deletedAt: '2026-08-31T10:01:00.000Z' },
				unreadCount: 0,
			})
		},
	})
	const inbox = createNotificationInbox(api, 60_000, () => {})
	await inbox.refresh()
	const beforeStop = get(inbox)

	const settingRead = inbox.setRead(8, true)
	const removing = inbox.remove(9)
	const outcomes = Promise.allSettled([settingRead, removing])
	await waitFor(() => setReadCalls === 1)
	assert.equal(deleteCalls, 0)
	inbox.stop()
	firstMutation.resolve(ok({
		notification: { ...notification(8), readAt: '2026-08-31T10:00:00.000Z' },
		unreadCount: 1,
	}))

	for (const outcome of await outcomes) {
		assert.equal(outcome.status, 'rejected')
		if (outcome.status === 'rejected') assert.match(String(outcome.reason), /canceled/i)
	}
	assert.equal(deleteCalls, 0)
	assert.deepEqual(get(inbox), beforeStop)
})

async function loadCreateNotificationInbox(): Promise<(
	api: Pick<ChivServerApi, 'notifications'>,
	pollMs: number,
	onArrival: (notification: NotificationRecord, context?: ArrivalContext) => void | Promise<void>,
) => Inbox> {
	const modulePath = './notificationInbox'
	const module = await import(modulePath).catch(() => ({}))
	const factory = Reflect.get(module, 'createNotificationInbox')
	assert.equal(typeof factory, 'function')
	return factory as (
		api: Pick<ChivServerApi, 'notifications'>,
		pollMs: number,
		onArrival: (notification: NotificationRecord, context?: ArrivalContext) => void | Promise<void>,
	) => Inbox
}

function notificationApi(overrides: Partial<ChivServerApi['notifications']>): Pick<ChivServerApi, 'notifications'> {
	return {
		notifications: {
			list: async () => ok(page([], 0, 0)),
			setRead: async () => ok({ notification: notification(1), unreadCount: 0, totalCount: 0 }),
			markAllRead: async () => ok({ unreadCount: 0, totalCount: 0 }),
			delete: async () => ok({ notification: notification(1), unreadCount: 0, totalCount: 0 }),
			...overrides,
		},
	}
}

function page(notifications: NotificationRecord[], nextAfterId: number, unreadCount: number): NotificationPage {
	return { notifications, nextAfterId, unreadCount, totalCount: notifications.length }
}

function notification(id: number): NotificationRecord {
	return {
		id,
		userId: 2,
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
		createdAt: `2026-08-31T09:00:00.000Z`,
		updatedAt: `2026-08-31T09:00:00.000Z`,
	}
}

function ok(data: unknown): CoreCallResult {
	return { ok: true, status: 200, statusText: 'OK', data }
}

function failed(message: string): CoreCallResult {
	return {
		ok: false,
		status: 503,
		statusText: 'Service Unavailable',
		data: null,
		error: { code: 'UNAVAILABLE', message },
	}
}

type Deferred<T> = {
	promise: Promise<T>
	resolve(value: T): void
}

function deferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void
	const promise = new Promise<T>((next) => {
		resolve = next
	})
	return { promise, resolve }
}

async function waitFor(condition: () => boolean, timeoutMs = 500): Promise<void> {
	const deadline = Date.now() + timeoutMs
	while (!condition()) {
		if (Date.now() >= deadline) throw new Error('Timed out waiting for condition.')
		await delay(2)
	}
}

function delay(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds))
}
