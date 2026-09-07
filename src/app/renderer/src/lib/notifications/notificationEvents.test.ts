import assert from "node:assert/strict"
import test from "node:test"
import type { NotificationRecord } from "@spellbook/shared/notifications.js"
import { NotificationEventBus } from "./notificationEvents.js"
import { presentNotificationArrival } from "./notificationPresentation.js"
import type { NotificationRequest } from "./notificationTypes.js"

test(`preserves durable arrival title text byte-for-byte through the event bus`, () => {
	const bus = new NotificationEventBus()
	const received: NotificationRequest[] = []
	const stop = bus.listen((request) => received.push(request))

	presentNotificationArrival(notification({ title: ` \tÅngström 玩家 [Ω]\t ` }), {
		isCurrent: () => true,
		notify: (request) => bus.emit(request),
		playSfx: () => {},
		setRead: async () => {},
		open: async () => {},
	})
	stop()

	assert.equal(received.length, 1)
	assert.equal(received[0]?.message, ` \tÅngström 玩家 [Ω]\t `)
})

test(`rejects whitespace-only transient messages`, () => {
	const bus = new NotificationEventBus()
	const received: NotificationRequest[] = []
	const stop = bus.listen((request) => received.push(request))

	bus.emit({ message: ` \t\r\n `, level: `info` })
	stop()

	assert.deepEqual(received, [])
})

function notification(overrides: Partial<NotificationRecord> = {}): NotificationRecord {
	return {
		id: 42,
		userId: 7,
		tone: `success`,
		title: `Notification`,
		description: null,
		icon: null,
		source: `player-action`,
		content: {},
		meta: {},
		callback: null,
		readAt: null,
		deletedAt: null,
		createdAt: `2026-08-31T10:15:00.000Z`,
		updatedAt: `2026-08-31T10:15:00.000Z`,
		...overrides,
	}
}
