import { writable, type Readable } from 'svelte/store'
import type {
	NotificationInbox,
	NotificationInboxState,
} from './notificationInbox'

const emptyState = (): NotificationInboxState => ({
	notifications: [],
	unreadCount: 0,
	totalCount: 0,
	loading: false,
	error: null,
})

export type NotificationInboxSession = Readable<NotificationInboxState> & {
	sync(userId: number | null): Promise<void>
	stop(): void
	refresh(): Promise<void>
	setRead(id: number, read: boolean): Promise<void>
	markAllRead(): Promise<void>
	remove(id: number): Promise<void>
}

export function createNotificationInboxSession(
	createInbox: () => Promise<NotificationInbox>,
	onError: (error: unknown) => void,
	onReset: () => void = () => {},
): NotificationInboxSession {
	const store = writable(emptyState())
	let inbox: NotificationInbox | null = null
	let unsubscribe: (() => void) | null = null
	let activeUserId: number | null = null
	let pendingUserId: number | null = null
	let generation = 0

	function clear(): void {
		inbox?.stop()
		unsubscribe?.()
		inbox = null
		unsubscribe = null
		activeUserId = null
		store.set(emptyState())
	}

	async function sync(userId: number | null): Promise<void> {
		if (userId !== null && (userId === activeUserId || userId === pendingUserId)) return

		const currentGeneration = ++generation
		pendingUserId = userId
		clear()
		onReset()
		if (userId === null) {
			pendingUserId = null
			return
		}

		try {
			const replacement = await createInbox()
			if (currentGeneration !== generation || pendingUserId !== userId) {
				replacement.stop()
				return
			}
			inbox = replacement
			activeUserId = userId
			pendingUserId = null
			unsubscribe = inbox.subscribe(store.set)
			inbox.start()
		} catch (error) {
			if (currentGeneration === generation) {
				pendingUserId = null
				onError(error)
			}
		}
	}

	return {
		subscribe: store.subscribe,
		sync,
		stop(): void {
			generation += 1
			pendingUserId = null
			clear()
			onReset()
		},
		refresh(): Promise<void> {
			return inbox?.refresh() ?? Promise.resolve()
		},
		setRead(id: number, read: boolean): Promise<void> {
			return inbox?.setRead(id, read) ?? Promise.resolve()
		},
		markAllRead(): Promise<void> {
			return inbox?.markAllRead() ?? Promise.resolve()
		},
		remove(id: number): Promise<void> {
			return inbox?.remove(id) ?? Promise.resolve()
		},
	}
}
