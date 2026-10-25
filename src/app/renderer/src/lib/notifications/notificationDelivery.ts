import type { ToastRequest } from '../../../../shared/notificationToast'
import type { NotificationRequest, NotificationSound } from './notificationTypes'

type DeliveryPorts = {
	hasNativeToast(): boolean
	showApp(request: NotificationRequest): void
	showNative(request: ToastRequest): Promise<boolean>
	playSound(sound: NotificationSound): void
	now(): number
}

export function createNotificationDelivery(ports: DeliveryPorts) {
	const seen = new Map<string, number>()
	let generation = 0
	let nextActionId = 0
	let activeAction: { id: number, onClick: () => void | Promise<void> } | undefined

	return {
		clear() {
			generation += 1
			seen.clear()
			activeAction = undefined
		},
		async activate(id: number): Promise<void> {
			if (activeAction?.id !== id) return
			const action = activeAction
			activeAction = undefined
			await action.onClick()
		},
		async show(request: NotificationRequest): Promise<void> {
			const current = generation
			const now = ports.now()
			for (const [key, expiresAt] of seen) if (expiresAt <= now) seen.delete(key)
			if (request.dedupeKey && request.createdAt !== undefined) {
				if (seen.has(request.dedupeKey)) return
				seen.set(request.dedupeKey, now + 30_000)
			}
			if (ports.hasNativeToast()) {
				const { action, sound, dedupeKey, ...toast } = request
				const id = ++nextActionId
				activeAction = action ? { id, onClick: action.onClick } : undefined
				if (action) Object.assign(toast, { actionId: id, actionLabel: action.label, ...(action.icon ? { actionIcon: action.icon } : {}) })
				if (!await ports.showNative(toast)) {
					if (activeAction?.id === id) activeAction = undefined
					return
				}
			} else {
				ports.showApp(request)
			}
			if (current === generation && request.sound) ports.playSound(request.sound)
		},
	}
}
