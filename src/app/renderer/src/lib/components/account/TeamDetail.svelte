<script lang="ts">
	import type { TeamMemberRecord } from "$lib/core"
	import EmptyState from "$lib/components/ui/EmptyState.svelte"
	import TeamMemberPicker from "./TeamMemberPicker.svelte"
	import TeamMemberRow from "./TeamMemberRow.svelte"

	export let members: TeamMemberRecord[] = []
	export let memberOptions: TeamMemberRecord[] = []
	export let canAdmin = false
	export let busy = false
	export let loadingOptions = false
	export let onLoadOptions: () => Promise<void>
	export let onAdd: (user: TeamMemberRecord) => Promise<void>
	export let onRemove: (userId: number) => void
	export let onPermission: (member: TeamMemberRecord, action: string, enabled: boolean) => void

	const actions = ["read", "create", "edit", "delete", "admin"] as const
</script>

<div class="team-detail grid-stack gap-100">
	{#if canAdmin}
		<div class="team-detail__toolbar">
			<TeamMemberPicker
				users={memberOptions}
				loading={loadingOptions}
				disabled={busy}
				onOpen={onLoadOptions}
				onAdd={onAdd}
			/>
		</div>
	{/if}
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
	.team-detail__toolbar { display: flex; justify-content: flex-end; }
</style>
