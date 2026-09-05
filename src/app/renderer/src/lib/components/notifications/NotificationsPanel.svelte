<script lang="ts">
	import Button from "$lib/components/ui/Button.svelte"
	import EmptyState from "$lib/components/ui/EmptyState.svelte"
	import Icon from "$lib/components/ui/Icon.svelte"
	import IconButton from "$lib/components/ui/IconButton.svelte"
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte"
	import type { NotificationInboxState } from "$lib/notifications/notificationInbox"
	import { notificationPresentation } from "$lib/notifications/notificationPresentation"
	import type { NotificationRecord, NotificationTone } from "@spellbook/shared/notifications"

	export let state: NotificationInboxState
	export let onRefresh: () => Promise<void>
	export let onSetRead: (id: number, read: boolean) => Promise<void>
	export let onMarkAllRead: () => Promise<void>
	export let onRemove: (id: number) => Promise<void>
	export let onOpen: (notification: NotificationRecord) => Promise<void>

	let pendingIds = new Set<number>()
	$: notifications = [...state.notifications].sort((left, right) => right.id - left.id)

	async function refresh(): Promise<void> {
		try {
			await onRefresh()
		} catch {
			// The inbox state carries the request error.
		}
	}

	async function setRead(notification: NotificationRecord, read: boolean): Promise<void> {
		await mutate(notification.id, () => onSetRead(notification.id, read))
	}

	async function markAllRead(): Promise<void> {
		try {
			await onMarkAllRead()
		} catch {
			// The inbox state carries the mutation error.
		}
	}

	async function remove(notification: NotificationRecord): Promise<void> {
		await mutate(notification.id, () => onRemove(notification.id))
	}

	async function open(notification: NotificationRecord): Promise<void> {
		await mutate(notification.id, async () => {
			if (!notification.readAt) await onSetRead(notification.id, true)
			await onOpen(notification)
		})
	}

	async function mutate(id: number, operation: () => Promise<void>): Promise<void> {
		if (pendingIds.has(id)) return
		pendingIds = new Set(pendingIds).add(id)
		try {
			await operation()
		} catch {
			// The inbox state carries the mutation error.
		} finally {
			const next = new Set(pendingIds)
			next.delete(id)
			pendingIds = next
		}
	}

	function fallbackIcon(tone: NotificationTone): string {
		if (tone === `success`) return `fa-circle-check`
		if (tone === `error`) return `fa-circle-xmark`
		if (tone === `warning`) return `fa-triangle-exclamation`
		return `fa-bell`
	}

	function formatDate(value: string): string {
		const date = new Date(value)
		return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
	}
</script>

<section class="panel-view notifications-view" aria-label="Notifications">
	<PanelHeader title="Notifications" eyebrow={`Inbox (${state.unreadCount}/${state.totalCount})`}>
		<svelte:fragment slot="trailing">
			<IconButton
				icon="fa-envelope-open"
				ariaLabel="Mark all notifications as read"
				tooltip="Mark all as read"
				disabled={state.loading || state.unreadCount === 0}
				onClick={() => void markAllRead()}
			/>
			<IconButton
				icon="fa-rotate"
				ariaLabel="Refresh notifications"
				tooltip="Refresh notifications"
				disabled={state.loading}
				onClick={() => void refresh()}
			/>
		</svelte:fragment>
	</PanelHeader>
	<div class="notifications-view__body">
		{#if state.error}
			<p class="notifications-view__error" role="alert">{state.error}</p>
		{/if}
		{#if notifications.length}
			<div class="notification-inbox" aria-live="polite">
				{#each notifications as notification (notification.id)}
					{@const presentation = notificationPresentation(notification)}
					<article
						class={`notification-row notification-row--${notification.tone}`}
						class:notification-row--unread={!presentation.read}
					>
						<span class="notification-row__icon" aria-hidden="true">
							<Icon
								name={presentation.icon ?? fallbackIcon(notification.tone)}
								type={presentation.iconType}
								size="lg"
							/>
						</span>
						<div class="notification-row__copy">
							<span class="notification-row__meta">
								<time datetime={presentation.createdAt}>{formatDate(presentation.createdAt)}</time>
								<span class:notification-row__state--unread={!presentation.read}>
									{presentation.read ? `Read` : `Unread`}
								</span>
							</span>
							<h2>{presentation.title}</h2>
							{#if presentation.description}<p>{presentation.description}</p>{/if}
							{#if presentation.callbackLabel}
								<span class="notification-row__action">
									<Button
										label={presentation.callbackLabel}
										icon="fa-arrow-up-right-from-square"
										size="sm"
										disabled={pendingIds.has(notification.id)}
										onClick={() => void open(notification)}
									/>
								</span>
							{/if}
						</div>
						<span class="notification-row__controls">
							<IconButton
								icon={presentation.read ? `fa-envelope` : `fa-envelope-open`}
								ariaLabel={presentation.read ? `Mark as unread` : `Mark as read`}
								tooltip={presentation.read ? `Mark as unread` : `Mark as read`}
								size="sm"
								disabled={pendingIds.has(notification.id)}
								onClick={() => void setRead(notification, !presentation.read)}
							/>
							<IconButton
								icon="fa-trash"
								ariaLabel="Delete notification"
								tooltip="Delete notification"
								tone="danger"
								size="sm"
								disabled={pendingIds.has(notification.id)}
								onClick={() => void remove(notification)}
							/>
						</span>
					</article>
				{/each}
			</div>
		{:else}
			<EmptyState
				title={state.loading ? `Loading notifications` : `No notifications`}
				message={state.loading ? `Fetching your inbox.` : `New notifications will appear here.`}
			/>
		{/if}
	</div>
</section>

<style lang="scss">
	.notifications-view {
		box-sizing: border-box;
		height: 100%;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		gap: var(--gutter-lg);
		padding-top: var(--gutter-lg);
	}

	.notifications-view__body {
		min-height: 0;
		padding: 0 var(--gutter-lg) var(--gutter-lg);
		overflow: auto;
	}

	.notifications-view__error {
		margin: 0 0 var(--gutter-md);
		border: 1px solid var(--color-accent-quaternary);
		border-radius: var(--radius);
		padding: var(--gutter-md);
		color: var(--color-accent-quaternary);
		font-size: var(--font-size-xs);
	}

	.notification-inbox {
		display: grid;
		gap: var(--gutter-md);
	}

	.notification-row {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		align-items: start;
		gap: var(--gutter-md);
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		padding: var(--gutter-md);
		background: rgbaa(var(--color-dark-primary), 0.35);
	}

	.notification-row--unread {
		border-color: var(--color-accent-primary);
		background: rgbaa(var(--color-accent-primary), 0.06);
	}

	.notification-row__icon {
		width: var(--control-height-md);
		height: var(--control-height-md);
		display: grid;
		place-items: center;
		border-radius: 50%;
		color: var(--color-light-secondary);
		background: rgbaa(var(--color-dark-tertiary), 0.18);
	}

	.notification-row--success .notification-row__icon {
		color: var(--color-accent-secondary);
	}

	.notification-row--error .notification-row__icon {
		color: var(--color-accent-quaternary);
	}

	.notification-row--warning .notification-row__icon {
		color: var(--color-accent-tertiary);
	}

	.notification-row__copy {
		min-width: 0;
		display: grid;
		gap: var(--gutter-sm);
	}

	.notification-row__copy h2,
	.notification-row__copy p {
		margin: 0;
	}

	.notification-row__copy h2 {
		font-size: var(--font-size-md);
		font-weight: var(--font-weight-medium);
		line-height: 1.3;
		overflow-wrap: anywhere;
	}

	.notification-row__copy p {
		color: var(--color-light-secondary);
		font-size: var(--font-size-xs);
		line-height: 1.45;
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}

	.notification-row__meta {
		display: flex;
		align-items: center;
		gap: var(--gutter-sm);
		color: var(--color-light-tertiary);
		font-size: var(--font-size-xs);
	}

	.notification-row__state--unread {
		color: var(--color-accent-primary);
		font-weight: var(--font-weight-medium);
	}

	.notification-row__action {
		justify-self: start;
		margin-top: var(--gutter-sm);
	}

	.notification-row__controls {
		display: flex;
		gap: var(--gutter-sm);
	}
</style>
