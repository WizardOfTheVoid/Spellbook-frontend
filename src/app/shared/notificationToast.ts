export const DEFAULT_NOTIFICATION_DURATION_MS = 5000

export type ToastRequest = {
	message: string
	description?: string
	level: `success` | `error` | `warning` | `info`
	icon?: string
	iconType?: `light` | `brands`
	avatarUrl?: string
	avatarName?: string
	variant?: `wanted`
	durationMs?: number
	gameServerId?: number
	createdAt?: string
	actionId?: number
	actionLabel?: string
	actionIcon?: string
}
