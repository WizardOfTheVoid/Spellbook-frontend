<script lang="ts">
	import type { TeamMemberRecord } from "$lib/core";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import TeamMemberPicker from "./TeamMemberPicker.svelte";
	import TeamMemberRow from "./TeamMemberRow.svelte";

	export let members: TeamMemberRecord[] = [];
	export let memberOptions: TeamMemberRecord[] = [];
	export let canAdmin = false;
	export let busy = false;
	export let loadingOptions = false;
	export let onLoadOptions: () => Promise<void>;
	export let onAdd: (user: TeamMemberRecord) => Promise<void>;
	export let onRemove: (userId: number) => void;
	export let onPermission: (
		member: TeamMemberRecord,
		action: string,
		enabled: boolean,
	) => void;

	const actions = ["read", "create", "edit", "delete", "admin"] as const;
</script>

<div class="team-detail grid-stack gap-125 margin-top-2">
	<div class="team-detail__header">
		<h3>Team members</h3>
		{#if canAdmin}
			<TeamMemberPicker
				users={memberOptions}
				loading={loadingOptions}
				disabled={busy}
				onOpen={onLoadOptions}
				{onAdd}
			/>
		{/if}
	</div>
	{#each members as member (member.userId)}
		<TeamMemberRow
			{member}
			{actions}
			{canAdmin}
			{busy}
			onPermission={(action, enabled) => onPermission(member, action, enabled)}
			onRemove={() => onRemove(member.userId)}
		/>
	{:else}
		<EmptyState title="No members" message="Add a user to this team." />
	{/each}
</div>

<style lang="scss">
	.team-detail__header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--gutter-md);
	}
	.team-detail__header h2 {
		margin: 0;
	}
</style>
