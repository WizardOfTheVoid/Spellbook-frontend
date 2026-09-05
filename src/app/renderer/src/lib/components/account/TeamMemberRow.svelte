<script lang="ts">
	import type { TeamMemberRecord } from "$lib/core";
	import Checkbox from "$lib/components/ui/Checkbox.svelte";
	import Icon from "$lib/components/ui/Icon.svelte";
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import ListRow from "$lib/components/ui/ListRow.svelte";

	export let member: TeamMemberRecord;
	export let actions: readonly string[];
	export let canAdmin = false;
	export let busy = false;
	export let onPermission: (action: string, enabled: boolean) => void;
	export let onRemove: () => void;
</script>

<div class="team-member-row">
	<ListRow
		title={member.displayName}
		subtitle={`@${member.username} · ${member.playfabId ?? "No PlayFab ID"}`}
	>
		<svelte:fragment slot="leading">
			<span class="member-avatar">
				{#if member.avatarUrl}<img src={member.avatarUrl} alt="" />{:else}<Icon
						name="fa-user"
						size="md"
						tone="muted"
					/>{/if}
			</span>
		</svelte:fragment>
		<svelte:fragment slot="trailing">
			{#if member.isOwner}<span class="member-owner">Owner</span>{/if}
			{#if canAdmin && !member.isOwner}
				<IconButton
					icon="fa-xmark"
					ariaLabel={`Remove ${member.displayName}`}
					tone="danger"
					size="sm"
					disabled={busy}
					onClick={onRemove}
				/>
			{/if}
		</svelte:fragment>
	</ListRow>
	<div
		class="team-member-row__permissions"
		aria-label={`${member.displayName} permissions`}
	>
		{#each actions as action}
			<Checkbox
				label={action}
				checked={member.isOwner || member.permissions.includes(action)}
				disabled={member.isOwner || !canAdmin || busy}
				onChange={(enabled) => onPermission(action, enabled)}
			/>
		{/each}
	</div>
</div>

<style lang="scss">
	.team-member-row {
		display: grid;
		gap: var(--gutter-sm);
	}
	.team-member-row__permissions {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: var(--gutter-sm);
		padding: 0 var(--gutter-md) var(--gutter-md);
	}
	.member-avatar {
		width: 44px;
		height: 44px;
		display: grid;
		place-items: center;
		overflow: hidden;
		border: 1px solid var(--color-dark-tertiary);
		border-radius: 999px;
	}
	.member-avatar img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.member-owner {
		color: var(--color-accent-primary);
		font-size: var(--font-size-xs);
		font-weight: var(--font-weight-medium);
	}
	@media (max-width: 900px) {
		.team-member-row__permissions {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
	}
</style>
