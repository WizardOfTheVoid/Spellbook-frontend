import type { ToastRequest } from '../../../../shared/notificationToast'
export { DEFAULT_NOTIFICATION_DURATION_MS } from '../../../../shared/notificationToast'

export type NotificationLevel = ToastRequest[`level`]
export type NotificationSound = `notification` | `wanted-notification` | `badge`

export type NotificationToastAction = {
	label: string
	onClick: () => void | Promise<void>
}

export type NotificationRequest = ToastRequest & {
	dedupeKey?: string
	sound?: NotificationSound
	action?: NotificationToastAction
}

export type NotificationItem = Omit<NotificationRequest, `createdAt`> & {
	id: string
	createdAt: number
	durationMs: number
}

export type NotificationOptions = Omit<NotificationRequest, `message` | `level` | `createdAt`>
