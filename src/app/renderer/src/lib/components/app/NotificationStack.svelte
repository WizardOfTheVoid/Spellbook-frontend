<script lang="ts">
	import { onMount } from "svelte";
	import { notificationEvents } from "$lib/notifications/notificationEvents";
	import Icon from "$lib/components/ui/Icon.svelte"
	import {
		DEFAULT_NOTIFICATION_DURATION_MS,
		type NotificationItem,
		type NotificationRequest,
	} from "$lib/notifications/notificationTypes";
	import {
		clearEvictedNotificationTimers,
		limitNotificationQueue,
	} from "$lib/notifications/notificationQueue"

	const timers = new Map<string, number>();
	let nextNotificationId = 0;
	let notifications: NotificationItem[] = [];

	onMount(() => {
		const stopListening = notificationEvents.listen(addNotification, clearNotifications);

		return () => {
			stopListening();
			clearNotifications();
		};
	});

	function clearNotifications(): void {
		for (const timer of timers.values()) window.clearTimeout(timer);
		timers.clear();
		notifications = [];
	}

	function addNotification(request: NotificationRequest): void {
		const existing = findExistingNotification(request);
		const notification: NotificationItem = {
			...request,
			id: existing?.id ?? `notification-${(nextNotificationId += 1)}`,
			createdAt: Date.now(),
			durationMs: request.durationMs ?? DEFAULT_NOTIFICATION_DURATION_MS,
		};

		const nextNotifications =
			existing ?
				notifications.map((item) =>
					item.id === existing.id ? notification : item,
				)
			:	[...notifications, notification];

		const limited = limitNotificationQueue(nextNotifications)

		clearEvictedNotificationTimers(
			limited.evictedIds,
			timers,
			window.clearTimeout,
		)
		notifications = limited.items

		startTimer(notification)
	}

	function findExistingNotification(
		request: NotificationRequest,
	): NotificationItem | null {
		if (!request.dedupeKey) {
			return null;
		}

		return (
			notifications.find((item) => item.dedupeKey === request.dedupeKey) ?? null
		);
	}

	function startTimer(notification: NotificationItem): void {
		const existingTimer = timers.get(notification.id);

		if (existingTimer) {
			window.clearTimeout(existingTimer);
		}

		timers.set(
			notification.id,
			window.setTimeout(
				() => removeNotification(notification.id),
				notification.durationMs,
			),
		);
	}

	function removeNotification(id: string): void {
		const timer = timers.get(id);

		if (timer) {
			window.clearTimeout(timer);
			timers.delete(id);
		}

		notifications = notifications.filter(
			(notification) => notification.id !== id,
		);
	}

	function fallbackIcon(level: NotificationItem["level"]): string {
		if (level === `success`) return `fa-circle-check`
		if (level === `error`) return `fa-circle-xmark`
		if (level === `warning`) return `fa-triangle-exclamation`
		return `fa-circle-info`
	}

	async function activateNotification(notification: NotificationItem): Promise<void> {
		removeNotification(notification.id)
		try {
			await notification.action?.onClick()
		} catch {
			// The durable inbox keeps the mutation error visible.
		}
	}
</script>

{#if notifications.length > 0}
	<section
		class="notification-stack"
		aria-label="Notifications"
		aria-live="polite"
	>
		{#each notifications as notification (notification.id)}
			<div
				class={`notification-item notification-item--${notification.level}`}
				role={notification.level === "error" ? "alert" : "status"}
			>
				<button
					class="notification-item__dismiss"
					type="button"
					aria-label="Dismiss notification"
					on:click={() => removeNotification(notification.id)}
				>
					<span class="notification-item__icon" aria-hidden="true">
						<Icon
							name={notification.icon ?? fallbackIcon(notification.level)}
							type={notification.iconType ?? `light`}
							size="sm"
						/>
					</span>
					<span class="notification-item__message">{notification.message}</span>
				</button>
				{#if notification.action}
					<button
						class="notification-item__action"
						type="button"
						on:click={() => void activateNotification(notification)}
					>
						{notification.action.label}
					</button>
				{/if}
			</div>
		{/each}
	</section>
{/if}
