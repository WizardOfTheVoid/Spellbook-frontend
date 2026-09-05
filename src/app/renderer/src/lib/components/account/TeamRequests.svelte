<script lang="ts">
	import { onMount } from "svelte"
	import type { TeamJoinRequest } from "$lib/core"
	import { unwrap } from "$lib/utils/apiResult"
	import { notifyError, notifySuccess } from "$lib/notifications/notificationEvents"
	import Tile from "$lib/components/ui/Tile.svelte"
	import TeamJoinRequests from "./TeamJoinRequests.svelte"

	export let teamId: number
	export let view: `members` | `requests` = `members`
	export let onChanged: () => Promise<void>
	let requests: TeamJoinRequest[] = []
	let loading = false
	let busy = false
	let error = ``
	let disposed = false
	onMount(() => {
		void load()
		const timer = window.setInterval(() => { if (!busy) void load() }, 8000)
		return () => { disposed = true
			window.clearInterval(timer) }
	})

	async function load(): Promise<void> {
		if (loading) return
		loading = true
		try {
			const result = await unwrap<TeamJoinRequest[]>(await window.chivServer.teams.requests(teamId), `Join requests could not be loaded.`)
			if (!disposed) { requests = result
				error = `` }
		} catch (value) { error = message(value) }
		finally { loading = false }
	}

	async function decide(userId: number, decision: `approve` | `reject`): Promise<void> {
		if (busy) return
		busy = true
		try {
			await unwrap(await window.chivServer.teams.decideRequest(teamId, userId, decision), `Could not review the request.`)
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

{#if view === `requests`}
	{#if loading && !requests.length}<p role="status">Loading join requests...</p>{:else}
		<TeamJoinRequests {requests} busy={busy || loading} {error} onRefresh={() => void load()} onDecide={(userId, decision) => void decide(userId, decision)} />
	{/if}
{:else}
	<Tile title="Join requests" icon="fa-user-clock" subtitle={error ? `Could not load requests. Open to retry.` : `Review new members`} badge={requests.length} onClick={() => { view = `requests`
		void load() }} />
{/if}
