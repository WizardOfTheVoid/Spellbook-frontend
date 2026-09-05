export const DEFAULT_NOTIFICATION_DURATION_MS = 5000;

export type NotificationLevel = "success" | "error" | "warning" | "info";

export type NotificationToastAction = {
	label: string
	onClick: () => void | Promise<void>
}

export type NotificationRequest = {
	message: string;
	level: NotificationLevel;
	icon?: string
	iconType?: `light` | `brands`
	durationMs?: number;
	dedupeKey?: string;
	action?: NotificationToastAction
};

export type NotificationItem = NotificationRequest & {
	id: string;
	createdAt: number;
	durationMs: number;
};

export type NotificationOptions = {
	icon?: string
	iconType?: `light` | `brands`
	durationMs?: number;
	dedupeKey?: string;
	action?: NotificationToastAction
};
