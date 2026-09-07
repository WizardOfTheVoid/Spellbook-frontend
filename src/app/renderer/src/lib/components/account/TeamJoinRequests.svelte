<script lang="ts">
	import type { TeamJoinRequest } from "$lib/core"
	import Button from "$lib/components/ui/Button.svelte"
	import EmptyState from "$lib/components/ui/EmptyState.svelte"
	import ListRow from "$lib/components/ui/ListRow.svelte"
	export let requests: TeamJoinRequest[]
	export let busy = false
	export let error = ``
	export let onRefresh: () => void
	export let onDecide: (userId: number, decision: `approve` | `reject`) => void
</script>

<div class="requests">
	<div class="toolbar"><h2>Join requests</h2><Button label="Refresh" icon="fa-rotate" disabled={busy} onClick={onRefresh} /></div>
	{#if error}<p role="alert">{error}</p>{/if}
	{#each requests as request (request.userId)}
		<ListRow title={request.displayName} subtitle={`@${request.username}`}>
			<svelte:fragment slot="trailing">
				<Button label="Reject" disabled={busy} onClick={() => onDecide(request.userId, `reject`)} />
				<Button label="Approve" variant="primary" disabled={busy} onClick={() => onDecide(request.userId, `approve`)} />
			</svelte:fragment>
		</ListRow>
	{:else}
		{#if !error}<EmptyState title="All caught up" message="New requests to join this team will appear here." />{/if}
	{/each}
</div>

<style lang="scss">
	.requests { display: grid; gap: var(--gutter-md); }
	.toolbar { display: flex; align-items: center; justify-content: space-between; gap: var(--gutter-sm); }
	h2 { margin: 0; font-size: var(--font-size-lg); }
</style>
