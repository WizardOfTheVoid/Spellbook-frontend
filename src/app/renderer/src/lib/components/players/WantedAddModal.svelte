<script lang="ts">
	import { onMount } from "svelte"
	import Button from "$lib/components/ui/Button.svelte"
	import Checkbox from "$lib/components/ui/Checkbox.svelte"
	import Input from "$lib/components/ui/Input.svelte"
	import { containModalTab, mountModalEnvironment } from "$lib/utils/quickActionUi"

	export let isSuperadmin = false
	export let busy = false
	export let error: string | null = null
	export let returnFocus: HTMLButtonElement | null = null
	export let onAdd: (playfabId: string, mock: boolean) => void
	export let onCancel: () => void

	let modalRoot: HTMLDivElement
	let dialog: HTMLDivElement
	let playfabId = ""
	let mock = false

	onMount(() => {
		const cleanup = mountModalEnvironment(modalRoot, returnFocus)
		const handleKeydown = (event: KeyboardEvent): void => {
			if (event.key === `Escape` && !busy) onCancel()
			containModalTab(event, dialog, document.activeElement)
		}
		window.addEventListener(`keydown`, handleKeydown)
		return () => {
			window.removeEventListener(`keydown`, handleKeydown)
			cleanup()
		}
	})
</script>

<div class="wanted-add" bind:this={modalRoot}>
	<button class="wanted-add__backdrop" type="button" aria-label="Close" tabindex="-1" disabled={busy} on:click={onCancel}></button>
	<div bind:this={dialog} class="wanted-add__dialog" role="dialog" aria-modal="true" aria-labelledby="wanted-add-title" tabindex="-1">
		<header><p>Community Hivemind</p><h1 id="wanted-add-title">Add wanted player</h1></header>
		<form on:submit|preventDefault={() => onAdd(playfabId.trim(), mock)}>
			<Input label="PlayFab ID" value={playfabId} maxlength={255} required disabled={busy} onChange={value => (playfabId = value)} />
			{#if isSuperadmin}
				<Checkbox label="Mock" description="Exercise the harmless Wanted lifecycle without banning the player." checked={mock} disabled={busy} onChange={value => (mock = value)} />
			{/if}
			<div class="wanted-add__notice" role="note">
				<strong>Use this with caution.</strong>
				<span>This will send out a community-ban to the Hivemind. Only use it against cheaters or hackers.</span>
			</div>
			{#if error}<p class="wanted-add__error" role="alert">{error}</p>{/if}
			<footer>
				<Button label="Cancel" disabled={busy} onClick={onCancel} />
				<Button label={busy ? `Adding...` : `Add`} icon="fa-plus" disabled={busy || !playfabId.trim()} onClick={() => onAdd(playfabId.trim(), mock)} />
			</footer>
		</form>
	</div>
</div>

<style lang="scss">
	.wanted-add { position: fixed; inset: 0; z-index: 40; display: grid; place-items: center; padding: var(--gutter-lg); }
	.wanted-add__backdrop { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; border-radius: 0; background: rgba(2, 8, 13, 0.76); }
	.wanted-add__dialog { position: relative; width: min(480px, 100%); display: grid; gap: var(--gutter-md); border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius-xl); padding: var(--gutter-lg); background: rgba(5, 13, 21, 0.98); box-shadow: var(--shadow); }
	header, form { display: grid; gap: var(--gutter-md); }
	header p, header h1, .wanted-add__error { margin: 0; }
	header p { color: var(--color-accent-quaternary); font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); }
	header h1 { font-size: var(--font-size-xl); }
	.wanted-add__notice { display: grid; gap: var(--gutter-sm); border: 1px solid var(--color-accent-quaternary); border-radius: var(--radius); padding: var(--gutter-md); color: var(--color-light-secondary); background: rgbaa(var(--color-accent-quaternary), 0.08); font-size: var(--font-size-xs); line-height: 1.45; }
	.wanted-add__notice strong, .wanted-add__error { color: var(--color-accent-quaternary); }
	footer { display: flex; justify-content: flex-end; gap: var(--gutter-sm); }
</style>
