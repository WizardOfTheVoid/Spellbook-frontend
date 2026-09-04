import { writable, type Readable } from 'svelte/store'
import type { ChivServerApi, CoreCallResult } from '$lib/core'
import { unwrap } from '$lib/utils/apiResult'
import type {
	NotificationMutation,
	NotificationCounts,
	NotificationPage,
	NotificationRecord,
} from '@spellbook/shared/notifications.js'

export type NotificationInboxState = {
	notifications: NotificationRecord[]
	unreadCount: number
	totalCount: number
	loading: boolean
	error: string | null
}

export type NotificationInbox = Readable<NotificationInboxState> & {
	start(): void
	stop(): void
	refresh(): Promise<void>
	setRead(id: number, read: boolean): Promise<void>
	markAllRead(): Promise<void>
	remove(id: number): Promise<void>
}

export class NotificationInboxCanceledError extends Error {
	public constructor() {
		super('Notification operation was canceled.')
		this.name = 'NotificationInboxCanceledError'
	}
}

export type NotificationArrivalContext = {
	isCurrent(): boolean
}

export function createNotificationInbox(
	api: Pick<ChivServerApi, 'notifications'>,
	pollMs: number,
	onArrival: (
		notification: NotificationRecord,
		context: NotificationArrivalContext,
	) => void | Promise<void>,
): NotificationInbox {
	let state: NotificationInboxState = {
		notifications: [],
		unreadCount: 0,
		totalCount: 0,
		loading: false,
		error: null,
	}
	const store = writable(state)
	let cursor: number | undefined
	let hydrated = false
	let started = false
	let timer: ReturnType<typeof setTimeout> | null = null
	let inFlight: Promise<void> | null = null
	let revision = 0
	let generation = 0
	let mutationQueue = Promise.resolve()

	function setState(next: NotificationInboxState): void {
		state = next
		store.set(state)
	}

	function clearTimer(): void {
		if (timer === null) return
		clearTimeout(timer)
		timer = null
	}

	function schedule(): void {
		if (!started) return
		clearTimer()
		timer = setTimeout(() => {
			timer = null
			void refresh().catch(() => {})
		}, pollMs)
	}

	async function load(): Promise<void> {
		const startingRevision = revision
		const startingGeneration = generation
		const arrivalContext = Object.freeze({
			isCurrent: () => generation === startingGeneration,
		})
		setState({ ...state, loading: true, error: null })
		try {
			const result = await api.notifications.list(cursor)
			if (generation !== startingGeneration) return
			const page = await unwrap<NotificationPage>(
				result,
				'Notifications request failed.',
			)
			if (generation !== startingGeneration) return
			if (revision !== startingRevision) {
				setState({ ...state, loading: false, error: null })
				return
			}
			const knownIds = new Set(state.notifications.map(({ id }) => id))
			const unseen = page.notifications.filter(({ id }) => {
				if (knownIds.has(id)) return false
				knownIds.add(id)
				return true
			})
			setState({
				notifications: [...state.notifications, ...unseen],
				unreadCount: page.unreadCount,
				totalCount: page.totalCount,
				loading: false,
				error: null,
			})
			cursor = Math.max(cursor ?? 0, page.nextAfterId)
			if (hydrated) {
				for (const notification of unseen) {
					if (generation !== startingGeneration) return
					try {
						await onArrival(notification, arrivalContext)
					} catch {
						// One presenter must not block later durable arrivals.
					}
					if (generation !== startingGeneration) return
				}
			}
			else hydrated = true
		} catch (error) {
			if (generation !== startingGeneration) return
			setState({ ...state, loading: false, error: message(error) })
			throw error
		}
	}

	function refresh(): Promise<void> {
		if (inFlight) return inFlight
		clearTimer()
		const request = load().finally(() => {
			if (inFlight === request) inFlight = null
			schedule()
		})
		inFlight = request
		return request
	}

	async function mutate(
		startingGeneration: number,
		request: () => Promise<CoreCallResult>,
		reconcile: (mutation: NotificationMutation) => NotificationRecord[],
	): Promise<void> {
		try {
			assertCurrent(startingGeneration)
			const result = await request()
			assertCurrent(startingGeneration)
			const mutation = await unwrap<NotificationMutation>(
				result,
				'Notification update failed.',
			)
			assertCurrent(startingGeneration)
			revision += 1
			setState({
				...state,
				notifications: reconcile(mutation),
				unreadCount: mutation.unreadCount,
				totalCount: mutation.totalCount,
				error: null,
			})
		} catch (error) {
			if (error instanceof NotificationInboxCanceledError || generation !== startingGeneration) {
				throw new NotificationInboxCanceledError()
			}
			setState({ ...state, error: message(error) })
			throw error
		}
	}

	function assertCurrent(expectedGeneration: number): void {
		if (generation !== expectedGeneration) throw new NotificationInboxCanceledError()
	}

	function enqueueMutation(operation: (startingGeneration: number) => Promise<void>): Promise<void> {
		const startingGeneration = generation
		const run = () => operation(startingGeneration)
		const result = mutationQueue.then(run, run)
		mutationQueue = result.catch(() => {})
		return result
	}

	return {
		subscribe: store.subscribe,
		start(): void {
			if (started) return
			started = true
			void refresh().catch(() => {})
		},
		stop(): void {
			started = false
			generation += 1
			clearTimer()
			setState({ ...state, loading: false, error: null })
		},
		refresh,
		setRead(id: number, read: boolean): Promise<void> {
			return enqueueMutation((startingGeneration) => mutate(
				startingGeneration,
				() => api.notifications.setRead(id, read),
				({ notification }) => state.notifications.map((item) =>
					item.id === notification.id ? notification : item),
			))
		},
		markAllRead(): Promise<void> {
			return enqueueMutation(async (startingGeneration) => {
				try {
					assertCurrent(startingGeneration)
					const counts = await unwrap<NotificationCounts>(
						await api.notifications.markAllRead(),
						`Notification update failed.`,
					)
					assertCurrent(startingGeneration)
					revision += 1
					setState({
						...state,
						notifications: state.notifications.map((notification) => ({
							...notification,
							readAt: notification.readAt ?? new Date().toISOString(),
						})),
						...counts,
						error: null,
					})
				} catch (error) {
					if (error instanceof NotificationInboxCanceledError || generation !== startingGeneration) {
						throw new NotificationInboxCanceledError()
					}
					setState({ ...state, error: message(error) })
					throw error
				}
			})
		},
		remove(id: number): Promise<void> {
			return enqueueMutation((startingGeneration) => mutate(
				startingGeneration,
				() => api.notifications.delete(id),
				({ notification }) => state.notifications.filter(({ id: itemId }) => itemId !== notification.id),
			))
		},
	}
}

function message(value: unknown): string {
	return value instanceof Error ? value.message : 'Notification request failed.'
}
