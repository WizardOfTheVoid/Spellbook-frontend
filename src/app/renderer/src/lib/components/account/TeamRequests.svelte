<script lang="ts">
	import { onMount, type Snippet } from "svelte"
	import type { TeamJoinRequest } from "$lib/core"
	import { unwrap } from "$lib/utils/apiResult"
	import { notifyError, notifySuccess } from "$lib/notifications/notificationEvents"
	import IconButton from "$lib/components/ui/IconButton.svelte"
	import TeamJoinRequests from "./TeamJoinRequests.svelte"
	import { pendingTeamRequests } from "$lib/stores/pendingTeamRequests"
	import { currentTeamState } from '$lib/teams/currentTeamStore'
	import { authState } from '$lib/auth/user'

	export let teamId: number
	export let onChanged: () => Promise<void>
	export let onHeaderActions: (actions: Snippet | null) => void = () => {}
	let requests: TeamJoinRequest[] = []
	let loading = false
	let busy = false
	let error = ``
	let disposed = false
	onMount(() => {
		onHeaderActions(actions)
		void load()
		const timer = window.setInterval(() => { if (!busy) void load() }, 8000)
		return () => { disposed = true
			onHeaderActions(null)
			window.clearInterval(timer) }
	})

	async function load(): Promise<void> {
		if (loading) return
		loading = true
		const userId = $authState.user?.id ?? null
		try {
			const result = await unwrap<TeamJoinRequest[]>(await window.chivServer.teams.requests(teamId), `Join requests could not be loaded.`)
			if (!disposed) { requests = result
				currentTeamState.updateRequestCount(teamId, result.length, userId)
				error = `` }
		} catch (value) { error = message(value) }
		finally { loading = false }
	}

	async function decide(userId: number, decision: `approve` | `reject`): Promise<void> {
		if (busy) return
		busy = true
		try {
			await unwrap(await window.chivServer.teams.decideRequest(teamId, userId, decision), `Could not review the request.`)
			void pendingTeamRequests.refresh()
			notifySuccess(decision === `approve` ? `Request approved.` : `Request rejected.`)
			await onChanged()
		} catch (value) { notifyError(message(value)) }
		finally { await load()
			busy = false }
	}
	function message(value: unknown): string {
		return value instanceof Error ? value.message : `Could not load join requests.`
	}
</script>

{#snippet actions()}
	<IconButton icon="fa-rotate" ariaLabel="Refresh join requests" tooltip="Refresh join requests" disabled={busy || loading} onClick={() => void load()} />
{/snippet}

	{#if loading && !requests.length}<p role="status">Loading join requests...</p>{:else}
		<TeamJoinRequests {requests} busy={busy || loading} {error} onDecide={(userId, decision) => void decide(userId, decision)} />
	{/if}
