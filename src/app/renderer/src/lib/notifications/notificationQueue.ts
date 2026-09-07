import type { NotificationItem } from "./notificationTypes"

export const maximumNotifications = 8

export function limitNotificationQueue(
	items: NotificationItem[],
	maximum = maximumNotifications
): { items: NotificationItem[]; evictedIds: string[] } {
	const overflow = Math.max(0, items.length - maximum)

	return {
		items: items.slice(overflow),
		evictedIds: items.slice(0, overflow).map(item => item.id)
	}
}

export function clearEvictedNotificationTimers(
	evictedIds: readonly string[],
	timers: Map<string, number>,
	clearTimer: (timer: number) => void
): void {
	for (const id of evictedIds) {
		const timer = timers.get(id)

		if (timer !== undefined) clearTimer(timer)
		timers.delete(id)
	}
}
