<script lang="ts">
	import type { ToastRequest } from "../../../../../shared/notificationToast";
	import NotificationIcon from "./notificationIcon.svelte";
	import WantedAmbient from "$lib/components/players/WantedAmbient.svelte";

	export let notification: Omit<ToastRequest, `createdAt`>;
	export let dismiss: () => void;
	export let action: { label: string; icon?: string; onClick: () => void } | undefined =
		undefined;

	let clickedAction: typeof action

	const icons = {
		success: `fa-circle-check`,
		error: `fa-circle-xmark`,
		warning: `fa-triangle-exclamation`,
		info: `fa-circle-info`,
	};
</script>

<div
	class="notification-toast"
	class:notification-toast--wanted={notification.variant === `wanted`}
	role={notification.level === `error` ? `alert` : `status`}
>
	{#if notification.variant === `wanted`}<WantedAmbient />{/if}
	<button
		class="notification-toast__body"
		type="button"
		aria-label="Dismiss notification"
		on:click={dismiss}
	>
		<div class="notification-toast__bg2"></div>
		<span class="notification-toast__icon">
			<NotificationIcon
				name={notification.icon ?? icons[notification.level]}
				type={notification.iconType ?? `light`}
				avatarUrl={notification.avatarUrl ?? null}
				avatarName={notification.avatarName ?? null}
			/>
		</span>
		<span class="notification-toast__copy">
			<strong>{notification.message}</strong>
			{#if notification.description}<span>{notification.description}</span>{/if}
		</span>
	</button>
	{#if action}<button
			class="notification-toast__action"
			type="button"
			disabled={clickedAction === action}
			on:click={() => {
				clickedAction = action
				action?.onClick()
			}}>{#if action.icon}<NotificationIcon name={action.icon} />{/if}{action.label}</button
		>{/if}
</div>

<style lang="scss">
	.notification-toast {
		position: relative;
		isolation: isolate;
		overflow: hidden;
		display: flex;
		align-items: center;
		gap: 12px;
		width: 100%;
		min-height: 60px;
		border: 1px solid rgbaa(var(--color-light-primary), 0.1);
		border-radius: var(--radius);
		background: var(--color-dark-primary);
		color: var(--color-light-primary);
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);

		& > *:not(.notification-toast__bg2) {
			position: relative;
			z-index: 1;
		}
	}

	.notification-toast__bg2 {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.2);
		z-index: 0;
	}

	.notification-toast__body {
		position: relative;
		z-index: 2;
		display: flex;
		align-items: center;
		gap: 12px;
		flex: 1;
		min-width: 0;
		padding: 12px 14px;
		border: 0;
		background: transparent;
		color: inherit;
		text-align: left;

		& > *:not(.notification-toast__bg2) {
			position: relative;
			z-index: 1;
		}
	}
	.notification-toast__icon {
		display: grid;
		place-items: center;
		flex: 0 0 32px;
		height: 32px;
		border-radius: calc(var(--radius) / 2);
		background: rgbaa(var(--color-light-primary), 0.05);
		color: var(--color-accent-primary);
	}
	.notification-toast--wanted .notification-toast__icon {
		color: var(--color-accent-quaternary);
	}
	.notification-toast__copy {
		display: flex;
		flex-direction: column;
		gap: 3px;
		min-width: 0;
		font-size: 12px;
		line-height: 1.4;
		overflow-wrap: anywhere;
	}
	.notification-toast__copy strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: var(--font-weight-bold);
	}
	.notification-toast__copy > span {
		display: -webkit-box;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		overflow: hidden;
		color: var(--color-light-secondary);
	}
	.notification-toast__action {
		position: relative;
		z-index: 1;
		margin-right: 14px;
		padding: 6px 8px;
		border: 1px solid rgbaa(var(--color-light-primary), 0.1);
		border-radius: calc(var(--radius) / 2);
		background: transparent;
		color: var(--color-accent-primary);
		font-size: 11px;
		white-space: nowrap;
	}
</style>
