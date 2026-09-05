<script lang="ts">
	import { onMount } from "svelte";
	import { getOverlayApi, type ToastRequest } from "$lib/core";

	const FADE_OUT_MS = 400;

	let toast: ToastRequest | null = null;
	let visible = false;
	let hideTimer: number | null = null;

	onMount(() => {
		let unsubscribe: (() => void) | undefined;

		try {
			unsubscribe = getOverlayApi().onToast(show);
		} catch {
			// The toast window can still render without the preload bridge during dev previews.
		}

		return () => {
			unsubscribe?.();
			clearHideTimer();
		};
	});

	function show(request: ToastRequest): void {
		clearHideTimer();
		toast = request;
		visible = true;
		hideTimer = window.setTimeout(() => {
			visible = false;
			hideTimer = null;
		}, request.durationMs ?? 4000);
	}

	function clearHideTimer(): void {
		if (hideTimer === null) return;
		window.clearTimeout(hideTimer);
		hideTimer = null;
	}

	function dismiss(): void {
		clearHideTimer();
		visible = false;

		try {
			void getOverlayApi().hideToast();
		} catch {
			// Without the preload bridge the toast can only fade out locally.
		}
	}
</script>

<div class="toast-stage" style:--toast-fade-ms={`${FADE_OUT_MS}ms`}>
	{#if toast}
		<button
			type="button"
			class="toast toast--{toast.level}"
			class:toast--visible={visible}
			on:click={dismiss}
		>
			<span class="toast__message">{toast.message}</span>
		</button>
	{/if}
</div>

<style lang="scss">
	.toast-stage {
		display: flex;
		align-items: flex-end;
		justify-content: flex-end;
		width: 100vw;
		height: 100vh;
		padding: 12px;
		background: transparent;
		overflow: hidden;
	}

	.toast {
		width: 100%;
		padding: 14px 16px;
		border: 0;
		border-radius: 10px;
		border-left: 4px solid #6b7280;
		background: rgba(17, 18, 22, 0.94);
		box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
		color: #f3f4f6;
		text-align: left;
		cursor: pointer;
		opacity: 0;
		transform: translateY(12px);
		transition:
			opacity var(--toast-fade-ms) ease,
			transform var(--toast-fade-ms) ease;
	}

	.toast--visible {
		opacity: 1;
		transform: translateY(0);
	}

	.toast--success {
		border-left-color: #34d399;
	}

	.toast--error {
		border-left-color: #f87171;
	}

	.toast--warning {
		border-left-color: #fbbf24;
	}

	.toast--info {
		border-left-color: #60a5fa;
	}

	.toast__message {
		margin: 0;
		display: block;
		font-size: 14px;
		line-height: 1.4;
	}
</style>
