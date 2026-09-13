<script lang="ts">
	import { onDestroy } from "svelte"
	import type { GameServerRecord, TeamRecord } from "$lib/core"
	import ConfirmModal from "$lib/components/ui/ConfirmModal.svelte"
	import MultiSelect from "$lib/components/ui/MultiSelect.svelte"
	import { getAllServers, teamServerOptions, teamServerClaimsInput, updateTeamServers } from "$lib/utils/gameServersApi"
	import { getServerLabel } from "$lib/utils/displayNames"
	import { notifyError, notifySuccess } from "$lib/notifications/notificationEvents"

	export let team: TeamRecord
	export let canAdmin: boolean
	export let onChanged: () => Promise<void>
	export let onClose: () => void

	let servers: GameServerRecord[] = []
	let initialIds = new Set<number>()
	let selectedValues: string[] = []
	let loadedTeamId: number | null = null
	let loading = true
	let saving = false
	let loadError = false
	let revision = 0
	let closed = false

	$: if (team.id !== loadedTeamId) void load(team.id)
	$: input = teamServerClaimsInput(initialIds, new Set(selectedValues.map(Number)))
	$: changed = input.claimServerIds.length + input.unclaimServerIds.length > 0
	$: options = teamServerOptions(servers, team.id)
	onDestroy(() => {
		closed = true
		revision += 1
	})

	function isCurrent(currentRevision: number, teamId: number): boolean {
		return !closed && revision === currentRevision && team.id === teamId
	}

	async function load(teamId: number): Promise<void> {
		loadedTeamId = teamId
		const currentRevision = ++revision
		loading = true
		loadError = false
		servers = []
		initialIds = new Set()
		selectedValues = []
		try {
			const loaded = await getAllServers({ official: false, deleted: `active`, includeMainMenu: false })
			if (!isCurrent(currentRevision, teamId)) return
			servers = loaded
			initialIds = new Set(servers.filter(server => server.ownerTeamId === teamId).map(server => server.id))
			selectedValues = [...initialIds].map(String)
		} catch (error) {
			if (!isCurrent(currentRevision, teamId)) return
			loadError = true
			notifyError(error instanceof Error ? error.message : `Could not load claimed servers.`)
		} finally {
			if (isCurrent(currentRevision, teamId)) loading = false
		}
	}

	async function save(): Promise<void> {
		if (!canAdmin || loading || saving || loadError || !changed) return
		const teamId = team.id
		const currentRevision = revision
		saving = true
		try {
			await updateTeamServers(teamId, input)
			if (!isCurrent(currentRevision, teamId)) return
			await onChanged()
			if (!isCurrent(currentRevision, teamId)) return
			notifySuccess(`Claimed servers updated.`)
			onClose()
		} catch (error) {
			if (!isCurrent(currentRevision, teamId)) return
			notifyError(error instanceof Error ? error.message : `Could not update claimed servers.`)
			await load(teamId)
		} finally {
			if (!closed && team.id === teamId) saving = false
		}
	}
</script>

<ConfirmModal
	title="Claimed servers"
	message={team.name}
	icon="fa-server"
	iconType="light"
	confirmLabel="Save changes"
	confirmTone="primary"
	cancelLabel={canAdmin ? `Cancel` : `Close`}
	busyLabel="Saving..."
	busy={saving}
	showConfirm={canAdmin}
	confirmDisabled={loading || loadError || !changed}
	manageOverlayState
	onConfirm={() => void save()}
	onCancel={onClose}
>
	{#if loading}
		<p>Loading servers...</p>
	{:else if loadError}
		<button type="button" on:click={() => void load(team.id)}>Retry loading servers</button>
	{:else if canAdmin}
		<MultiSelect ariaLabel="Claimed servers" {options} value={selectedValues} disabled={saving} onChange={values => selectedValues = values} />
		{#if input.unclaimServerIds.length > 0}
			<p>Unclaiming removes this team's profile attachment. Server variables are kept.</p>
		{/if}
	{:else}
		{#each servers.filter(server => initialIds.has(server.id)) as server (server.id)}
			<p>{getServerLabel(server)}</p>
		{:else}
			<p>No claimed servers.</p>
		{/each}
	{/if}
</ConfirmModal>
