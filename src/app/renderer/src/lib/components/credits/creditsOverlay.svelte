<script lang="ts">
	import { onMount } from "svelte"
	import { creditsAntiAfk } from './credits'
	import { productVersion } from "@spellbook/shared/productVersion"
	import { getOverlayApi } from "$lib/core"
	import IconButton from "$lib/components/ui/IconButton.svelte"
	import { notifyError } from "$lib/notifications/notificationEvents"
	import { containModalTab, mountModalEnvironment, ModalStateCoordinator } from "$lib/utils/quickActionUi"

	export let returnFocus: HTMLButtonElement | null = null
	export let onClose: () => void
	let dialog: HTMLDivElement
	let frame: HTMLIFrameElement
	let closeButton: HTMLButtonElement | undefined
	let removeFrameListener: (() => void) | undefined
	const modalState = new ModalStateCoordinator(open => getOverlayApi().setModalOpen(open))

	function handleKeydown(event: KeyboardEvent): void {
		if (event.key === `Escape`) {
			event.preventDefault()
			event.stopImmediatePropagation()
			onClose()
			return
		}
		const filmDocument = frame?.contentDocument
		const active = document.activeElement === frame ? filmDocument?.activeElement : document.activeElement
		const filmControls = filmDocument?.querySelector<HTMLElement>(`.sb-gate:not([hidden]), .sb-bottom`)
		if (event.key === `Tab` && !event.shiftKey && active === closeButton) {
			const firstControl = filmControls?.querySelector<HTMLElement>(`button, input`)
			if (firstControl) {
				event.preventDefault()
				firstControl.focus()
				return
			}
		}
		containModalTab(event, filmControls ? [dialog, filmControls] : dialog, active ?? null)
	}

	function bindFilmKeyboard(): void {
		removeFrameListener?.()
		const filmWindow = frame.contentWindow
		filmWindow?.addEventListener(`keydown`, handleKeydown, true)
		removeFrameListener = () => filmWindow?.removeEventListener(`keydown`, handleKeydown, true)
	}

	async function syncModal(open: boolean): Promise<void> {
		try { await modalState.set(open) }
		catch { notifyError(`Credits could not update its overlay state.`) }
	}

	async function syncAntiAfk(active: boolean): Promise<void> {
		try { await creditsAntiAfk.setActive(active) }
		catch { notifyError(`Credits could not ${active ? `enable` : `restore`} Anti-AFK.`) }
	}

	onMount(() => {
		void syncAntiAfk(true)
		const cleanup = mountModalEnvironment(dialog, returnFocus)
		const stopVisibility = getOverlayApi().onVisibilityChange(visible => {
			if (!visible) onClose()
		})
		window.addEventListener(`keydown`, handleKeydown, true)
		void syncModal(true)
		closeButton?.focus()
		return () => {
			void syncAntiAfk(false)
			removeFrameListener?.()
			window.removeEventListener(`keydown`, handleKeydown, true)
			stopVisibility()
			const filmWindow = frame?.contentWindow as (Window & { crawl?: { destroy: () => void } }) | null
			filmWindow?.crawl?.destroy()
			cleanup()
			void syncModal(false)
		}
	})
</script>

<div class="credits-overlay" role="dialog" aria-modal="true" aria-label="Credits" tabindex="-1" bind:this={dialog}>
	<div class="close">
		<IconButton icon="fa-xmark" ariaLabel="Close credits" tooltip="Close" bind:element={closeButton} onClick={onClose} />
	</div>
	<iframe bind:this={frame} src={`./credits/film.html?version=${encodeURIComponent(productVersion)}`} title="SpellBook credits" allow="autoplay" on:load={bindFilmKeyboard}></iframe>
</div>

<style>
	.credits-overlay { position: fixed; inset: 0; z-index: 1000; background: #000; }
	iframe { display: block; width: 100%; height: 100%; border: 0; }
	.close { position: absolute; top: 16px; right: 16px; z-index: 1; color: #fff; background: #0009; border-radius: 50%; }
</style>
