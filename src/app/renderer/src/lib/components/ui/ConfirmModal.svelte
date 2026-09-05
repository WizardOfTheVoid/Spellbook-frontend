<script lang="ts">
	import { onMount } from "svelte"
	import Icon from "./Icon.svelte"
	import { containModalTab, mountModalEnvironment, ModalStateCoordinator } from "$lib/utils/quickActionUi"
	import { getOverlayApi } from "$lib/core"
	import { notifyError } from "$lib/notifications/notificationEvents"

	export let title: string
	export let message: string
	export let confirmLabel = `Confirm`
	export let confirmTone: `primary` | `danger` = `danger`
	export let cancelLabel = `No, keep linked`
	export let busyLabel = `Unlinking...`
	export let icon = `fa-discord`
	export let iconType: `light` | `brands` = `brands`
	export let busy = false
	export let confirmDisabled = false
	export let manageOverlayState = false
	export let returnFocus: HTMLButtonElement | null = null
	export let onConfirm: () => void
	export let onCancel: () => void

	let modalRoot: HTMLDivElement
	let dialog: HTMLDivElement
	let cancelButton: HTMLButtonElement
	const modalState = new ModalStateCoordinator(open => getOverlayApi().setModalOpen(open))
	async function syncModal(open: boolean): Promise<void> {
		try { await modalState.set(open) }
		catch { notifyError(`Could not update the dialog state.`) }
	}

	onMount(() => {
		const cleanup = mountModalEnvironment(modalRoot, returnFocus ?? (document.activeElement instanceof HTMLButtonElement ? document.activeElement : null))
		const stopVisibility = manageOverlayState ? getOverlayApi().onVisibilityChange(visible => { if (!visible && !busy) onCancel() }) : () => {}
		if (manageOverlayState) void syncModal(true)
		const handleKeydown = (event: KeyboardEvent): void => {
			if (event.key === `Escape` && !busy) onCancel()
			containModalTab(event, dialog, document.activeElement)
		}
		window.addEventListener(`keydown`, handleKeydown)
		cancelButton.focus()
		return () => {
			stopVisibility()
			if (manageOverlayState) void syncModal(false)
			window.removeEventListener(`keydown`, handleKeydown)
			cleanup()
		}
	})
</script>

<div class="confirm-modal" bind:this={modalRoot}>
	<button
		class="confirm-modal__backdrop"
		type="button"
		aria-label="Cancel"
		tabindex="-1"
		disabled={busy}
		on:click={onCancel}
	></button>
	<div
		class="confirm-modal__dialog"
		bind:this={dialog}
		role="dialog"
		aria-modal="true"
		aria-labelledby="confirm-modal-title"
		tabindex="-1"
	>
		<span class="confirm-modal__icon"><Icon name={icon} type={iconType} size="lg" /></span>
		<div class="confirm-modal__copy">
			<h1 id="confirm-modal-title">{title}</h1>
			<p>{message}</p>
		</div>
		{#if $$slots.default}<div class="confirm-modal__content"><slot /></div>{/if}
		<footer>
			<button bind:this={cancelButton} type="button" disabled={busy} on:click={onCancel}>{cancelLabel}</button>
			<button class="confirm-modal__confirm" class:confirm-modal__confirm--primary={confirmTone === `primary`} type="button" disabled={busy || confirmDisabled} on:click={onConfirm}>
				{busy ? busyLabel : confirmLabel}
			</button>
		</footer>
	</div>
</div>

<style lang="scss">
	.confirm-modal {
		position: fixed;
		inset: 0;
		z-index: 35;
		display: grid;
		place-items: center;
		padding: var(--gutter-lg);
	}

	.confirm-modal__backdrop {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		border: 0;
		border-radius: 0;
		background: rgba(2, 8, 13, 0.76);
	}

	.confirm-modal__dialog {
		max-height: calc(100vh - 2 * var(--gutter-lg));
		overflow: auto;
		position: relative;
		width: min(430px, 100%);
		display: grid;
		grid-template-columns: auto minmax(0, 1fr);
		gap: var(--gutter-md);
		border: 1px solid var(--color-dark-tertiary);
		border-radius: var(--radius-xl);
		padding: var(--gutter-lg);
		background: rgba(5, 13, 21, 0.98);
		box-shadow: var(--shadow);
	}

	.confirm-modal__icon {
		color: var(--color-accent-primary);
	}
	.confirm-modal__content { grid-column: 1 / -1; display: grid; gap: var(--gutter-md); min-width: 0; }

	.confirm-modal__copy {
		display: grid;
		gap: var(--gutter-sm);
	}

	h1,
	p {
		margin: 0;
	}

	h1 {
		font-size: var(--font-size-lg);
	}

	p {
		color: var(--color-light-secondary);
		font-size: var(--font-size-md);
		line-height: 1.45;
	}

	footer {
		grid-column: 1 / -1;
		display: flex;
		justify-content: flex-end;
		gap: var(--gutter-sm);
	}

	footer button {
		min-height: var(--control-height-sm);
		border-radius: var(--radius);
		padding: 0 var(--gutter-md);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}

	.confirm-modal__confirm {
		color: var(--color-accent-quaternary);
		border-color: var(--color-accent-quaternary);
	}
	.confirm-modal__confirm--primary {
		color: var(--color-accent-primary);
		border-color: var(--color-accent-primary);
	}
</style>
