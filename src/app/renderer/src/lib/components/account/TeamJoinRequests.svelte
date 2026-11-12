<script lang="ts">
	import { getAdminName } from "@spellbook/shared/adminName.js"

	import type { TeamJoinRequest } from "$lib/core"
	import Button from "$lib/components/ui/Button.svelte"
	import EmptyState from "$lib/components/ui/EmptyState.svelte"
	import ListRow from "$lib/components/ui/ListRow.svelte"
	export let requests: TeamJoinRequest[]
	export let busyUserIds: number[] = []
	export let error = ``
	export let onDecide: (userId: number, decision: `approve` | `reject`) => void
</script>

<div class="requests">
	{#if error}<p role="alert">{error}</p>{/if}
	{#each requests as request (`request:${request.userId}`)}
		<ListRow title={getAdminName(request)} subtitle={`@${request.username}`}>
			<svelte:fragment slot="trailing">
				<Button label="Reject" disabled={busyUserIds.includes(request.userId)} onClick={() => onDecide(request.userId, `reject`)} />
				<Button label="Approve" variant="primary" disabled={busyUserIds.includes(request.userId)} onClick={() => onDecide(request.userId, `approve`)} />
			</svelte:fragment>
		</ListRow>
	{:else}
		{#if !error}<EmptyState title="All caught up" message="New requests to join this team will appear here." />{/if}
	{/each}
</div>

<style lang="scss">
	.requests { display: grid; gap: var(--gutter-md); }
</style>
