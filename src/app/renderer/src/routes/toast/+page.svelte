<script lang="ts">
	import { onMount, tick } from 'svelte'
	import { getOverlayApi, type ToastRequest } from '$lib/core'
	import NotificationToast from '$lib/components/notifications/notificationToast.svelte'
	import { DEFAULT_NOTIFICATION_DURATION_MS } from '$lib/notifications/notificationTypes'

	let toast: ToastRequest | null = null
	let visible = false
	let hideTimer: ReturnType<typeof setTimeout> | undefined
	let toastFrame: HTMLDivElement

	function fitToast(): void {
		if (toast && visible) window.chivOverlay?.resizeToast(Math.ceil(toastFrame.scrollHeight + 24))
	}

	onMount(() => {
		const observer = new ResizeObserver(fitToast)
		observer.observe(toastFrame)
		const unsubscribe = window.chivOverlay?.onToast(request => {
			clearTimeout(hideTimer)
			toast = request
			visible = true
			void tick().then(fitToast)
			hideTimer = setTimeout(() => visible = false, request.durationMs ?? DEFAULT_NOTIFICATION_DURATION_MS)
		})
		return () => {
			observer.disconnect()
			unsubscribe?.()
			clearTimeout(hideTimer)
		}
	})

	function dismiss(): void {
		clearTimeout(hideTimer)
		visible = false
		if (window.chivOverlay) void getOverlayApi().hideToast()
	}

	function activate(): void {
		if (toast?.actionId !== undefined) void getOverlayApi().activateToastAction(toast.actionId)
	}
</script>

<div class="toast-stage">
	<div class="toast-frame" class:visible bind:this={toastFrame}>
		{#if toast}
			<NotificationToast notification={toast} {dismiss}
				action={toast.actionId !== undefined && toast.actionLabel ? { label: toast.actionLabel, icon: toast.actionIcon, onClick: activate } : undefined} />
		{/if}
	</div>
</div>

<style lang="scss">
	.toast-stage {
		display: flex;
		align-items: flex-end;
		width: 100vw;
		height: 100vh;
		padding: 12px;
		background: transparent;
		overflow: hidden;
	}
	.toast-frame {
		width: 100%;
		max-height: calc(100vh - 24px);
		overflow-y: auto;
		opacity: 0;
		transform: translateY(8px);
		transition: opacity 200ms ease, transform 200ms ease;
	}
	.toast-frame.visible { opacity: 1; transform: translateY(0); }
</style>
