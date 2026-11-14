import assert from "node:assert/strict"
import test from "node:test"
import type { NotificationItem } from "./notificationTypes"
import { clearEvictedNotificationTimers, limitNotificationQueue } from "./notificationQueue"

test(`keeps the newest eight notifications`, () => {
	const notifications = Array.from({ length: 9 }, (_, index) => item(`${index + 1}`))

	assert.deepEqual(limitNotificationQueue(notifications), {
		items: notifications.slice(1),
		evictedIds: [`1`]
	})
})

test(`keeps eight notifications unchanged`, () => {
	const notifications = Array.from({ length: 8 }, (_, index) => item(`${index + 1}`))

	assert.deepEqual(limitNotificationQueue(notifications), {
		items: notifications,
		evictedIds: []
	})
})

test(`dedupe replacement does not create a ninth notification before limiting`, () => {
	const notifications = Array.from({ length: 8 }, (_, index) => item(`${index + 1}`))
	const replacement = { ...notifications[3]!, message: `updated` }
	const deduped = notifications.map(notification =>
		notification.id === replacement.id ? replacement : notification
	)

	assert.equal(deduped.length, 8)
	assert.deepEqual(limitNotificationQueue(deduped), {
		items: deduped,
		evictedIds: []
	})
})

test(`clears timers for evicted notifications`, () => {
	const timers = new Map([[`1`, 101], [`2`, 102]])
	const cleared: number[] = []

	clearEvictedNotificationTimers([`1`], timers, timer => cleared.push(timer))

	assert.deepEqual(cleared, [101])
	assert.deepEqual([...timers], [[`2`, 102]])
})

function item(id: string): NotificationItem {
	return {
		id,
		message: id,
		level: `info`,
		createdAt: Number(id),
		durationMs: 5000
	}
}
