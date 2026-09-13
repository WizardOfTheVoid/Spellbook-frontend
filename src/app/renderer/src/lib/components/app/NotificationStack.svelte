<script lang="ts">
	import { onMount } from "svelte";
	import { notificationEvents } from "$lib/notifications/notificationEvents";
	import NotificationToast from "$lib/components/notifications/notificationToast.svelte"
	import { getOverlayApi } from "$lib/core"
	import { SFX, playCustomSFX } from "$lib/global/sfx"
	import { createNotificationDelivery } from "$lib/notifications/notificationDelivery"
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

	const delivery = createNotificationDelivery({
		hasNativeToast: () => Boolean(window.chivOverlay),
		showApp: addNotification,
		showNative: request => getOverlayApi().showToast(request),
		playSound: sound => sound === `badge` ? SFX.play(`badge`) : playCustomSFX(sound),
		now: () => Date.now(),
	})

	function clearDelivery(): void {
		delivery.clear()
		clearNotifications()
		if (window.chivOverlay) void getOverlayApi().hideToast().catch(() => {})
	}

	onMount(() => {
		const stopActions = window.chivOverlay?.onToastAction(id => {
			void delivery.activate(id).catch(error => console.error(`Notification action failed.`, error))
		})
		const stopListening = notificationEvents.listen(request => {
			void delivery.show(request).catch(error => console.error(`Notification delivery failed.`, error))
		}, clearDelivery)


		return () => {
			stopListening()
			stopActions?.()
			clearDelivery()
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
	<section class="notification-stack" aria-label="Notifications" aria-live="polite">
		{#each notifications as notification (notification.id)}
			<NotificationToast {notification} dismiss={() => removeNotification(notification.id)}
				action={notification.action ? { label: notification.action.label, onClick: () => void activateNotification(notification) } : undefined} />
		{/each}
	</section>
{/if}
