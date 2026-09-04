import {
	wantedExecutionNotificationSource,
	type NotificationRecord,
} from "@spellbook/shared/notifications.js"
import type { NotificationRequest } from "./notificationTypes.js"

export type NotificationPresentation = {
	title: string
	description: string | null
	icon: string | null
	iconType: `light` | `brands`
	callbackLabel: string | null
	read: boolean
	createdAt: string
}

export type NotificationArrivalPorts = {
	isCurrent(): boolean
	notify(request: NotificationRequest): void
	playSfx(slug: `notification` | `wanted-notification`): void
	setRead(id: number, read: boolean): Promise<void>
	open(notification: NotificationRecord): Promise<void>
}

export function notificationPresentation(
	notification: NotificationRecord,
): NotificationPresentation {
	return {
		title: notification.title,
		description: notification.description,
		icon: notification.icon,
		iconType: notification.icon === `fa-discord` ? `brands` : `light`,
		callbackLabel: notification.callback?.label ?? null,
		read: notification.readAt !== null,
		createdAt: notification.createdAt,
	}
}

export function notificationSfx(
	source: string,
): `notification` | `wanted-notification` {
	return source === wantedExecutionNotificationSource ?
		`wanted-notification`
	: 	`notification`
}

export function presentNotificationArrival(
	notification: NotificationRecord,
	ports: NotificationArrivalPorts,
): void {
	const presentation = notificationPresentation(notification)
	if (!ports.isCurrent()) return
	ports.notify({
		message: presentation.title,
		level: notification.tone === `custom` ? `info` : notification.tone,
		icon: presentation.icon ?? undefined,
		iconType: presentation.iconType,
		dedupeKey: `durable-notification:${notification.id}`,
		action: notification.callback ? {
			label: notification.callback.label,
			onClick: async () => {
				if (!ports.isCurrent()) return
				await ports.setRead(notification.id, true)
				if (!ports.isCurrent()) return
				await ports.open(notification)
			},
		} : undefined,
	})
	if (!ports.isCurrent()) return
	ports.playSfx(notificationSfx(notification.source))
}
