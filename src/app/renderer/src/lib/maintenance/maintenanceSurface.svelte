<script lang="ts">
	import { onMount } from 'svelte'
	import type { MaintenanceRuntimeState } from '../../../../shared/maintenance'
	import Button from '$lib/components/ui/Button.svelte'

	export let state: MaintenanceRuntimeState
	export let signedIn = false
	export let canAdmin = false
	export let onAdmin: () => void
	export let onSignIn: () => void
	export let onSignOut: () => void
	export let onClose: () => void
	export let onRefresh: () => Promise<unknown>
	let refreshing = false
	let refreshError: string | null = null
	let title: HTMLHeadingElement
	onMount(() => title.focus())
	async function refresh() {
		if (refreshing) return
		refreshing = true
		refreshError = null
		try { await onRefresh() }
		catch (error) { refreshError = error instanceof Error ? error.message : `Could not check availability.` }
		finally { refreshing = false }
	}
</script>

<section class="maintenance-surface" aria-labelledby="maintenance-title">
	<div class="maintenance-surface__card">
		<h1 id="maintenance-title" bind:this={title} tabindex="-1">{state.maintenance?.title ?? `Connecting to SpellBook`}</h1>
		<p class="maintenance-surface__text">{state.maintenance?.text ?? `Checking availability. Please try again shortly.`}</p>
		<p role="status">{refreshError ?? state.error ?? (!state.databaseReady ? `Waiting for the server to reconnect…` : `Status refreshes automatically.`)}</p>
		<div class="maintenance-surface__actions">
			{#if canAdmin}<Button label="Open Admin" variant="primary" onClick={onAdmin} />{/if}
			{#if signedIn}<Button label="Sign out" onClick={onSignOut} />{:else}<Button label="Sign in" onClick={onSignIn} />{/if}
			<Button label={refreshing ? `Checking…` : `Check again`} disabled={refreshing} onClick={() => void refresh()} />
			<Button label="Minimize" onClick={onClose} />
		</div>
	</div>
</section>

<style lang="scss">
	.maintenance-surface { position: fixed; inset: 0; z-index: 20; display: grid; place-items: center; padding: var(--gutter-xl); background: var(--color-dark-primary); }
	.maintenance-surface__card { width: min(100%, 640px); display: grid; gap: var(--gutter-lg); padding: var(--gutter-xl); border: 1px solid var(--color-dark-secondary); border-radius: var(--radius-xl); }
	.maintenance-surface__text { white-space: pre-wrap; overflow-wrap: anywhere; }
	.maintenance-surface__actions { display: flex; flex-wrap: wrap; gap: var(--gutter-sm); }
</style>
