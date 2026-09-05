<script lang="ts">
	import { onMount } from "svelte"
	import type { TeamDirectoryEntry } from "$lib/core"
	import { unwrap } from "$lib/utils/apiResult"
	import { notifySuccess } from "$lib/notifications/notificationEvents"
	import Button from "$lib/components/ui/Button.svelte"
	import ConfirmModal from "$lib/components/ui/ConfirmModal.svelte"
	import ListRow from "$lib/components/ui/ListRow.svelte"
	import SearchField from "$lib/components/ui/SearchField.svelte"

	export let onClose: () => void
	let teams: TeamDirectoryEntry[] = []
	let selectedId: number | null = null
	let search = ``
	let loading = true
	let busy = false
	let error = ``
	$: filtered = teams.filter(team => team.name.toLowerCase().includes(search.toLowerCase()))
	$: selected = teams.find(team => team.id === selectedId)
	onMount(() => { void load() })

	async function load(): Promise<void> {
		loading = true
		error = ``
		try { teams = await unwrap(await window.chivServer.teams.directory(), `Teams could not be loaded.`) }
		catch (value) { error = value instanceof Error ? value.message : `Teams could not be loaded.` }
		finally { loading = false }
	}

	async function request(): Promise<void> {
		if (!selected || selected.member || selected.pending || busy) return
		const team = selected
		busy = true
		error = ``
		try {
			await unwrap(await window.chivServer.teams.requestAccess(team.id), `Request could not be sent.`)
			teams = teams.map(item => item.id === team.id ? { ...item, pending: true } : item)
			notifySuccess(`Request sent to ${team.name}.`)
		} catch (value) { error = value instanceof Error ? value.message : `Request could not be sent.` }
		finally { busy = false }
	}
</script>

<ConfirmModal title="Join team" message="Choose your team and request access. A team admin will review your request." icon="fa-users" iconType="light" {busy} confirmLabel={selected?.pending ? `Request pending` : `Request access`} confirmDisabled={loading || !selected || selected.member || selected.pending} confirmTone="primary" cancelLabel="Close" busyLabel="Sending..." manageOverlayState onConfirm={() => void request()} onCancel={onClose}>
	<SearchField label="Find a team" placeholder="Search teams" bind:value={search} />
	{#if loading}<p role="status">Loading teams...</p>{/if}
	{#if error}<p role="alert">{error}</p><Button label="Retry" disabled={busy} onClick={() => void load()} />{/if}
	<div class="team-options" aria-label="Available teams">
		{#each filtered as team (team.id)}
			<ListRow title={team.name} subtitle={team.member ? `Already a member` : team.pending ? `Request pending` : `Request to join`} selected={team.id === selectedId} onClick={busy || team.member ? null : () => selectedId = team.id} />
		{:else}
			{#if !loading && !error}<p>No teams found.</p>{/if}
		{/each}
	</div>
</ConfirmModal>

<style lang="scss">
	p { margin: 0; color: var(--color-light-secondary); }
	.team-options { display: grid; gap: var(--gutter-sm); max-height: 320px; overflow: auto; }
</style>
