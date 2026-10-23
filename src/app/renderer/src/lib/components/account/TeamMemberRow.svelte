<script lang="ts">
	import { getAdminName } from "@spellbook/shared/adminName.js"

	import type { TeamMemberRecord } from "$lib/core";
	import Checkbox from "$lib/components/ui/Checkbox.svelte";
	import AvatarUser from '$lib/components/ui/avatars/avatarUser.svelte'
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import ListRow from "$lib/components/ui/ListRow.svelte";
	import { tooltip } from "$lib/utils/tooltip"

	const permissionHelp: Record<string, string> = {
		read: `View the team and its shared profiles.`,
		create: `Create profiles for this team.`,
		edit: `Edit this team's profiles.`,
		delete: `Delete this team's profiles.`,
		admin: `All team permissions, including managing members, permissions, Discord, and deleting the team.`,
	}

	export let member: TeamMemberRecord;
	export let actions: readonly string[];
	export let canAdmin = false;
	export let busy = false;
	export let onPermission: (action: string, enabled: boolean) => void;
	export let onRemove: () => void;
</script>

<div class="team-member-row">
	<ListRow
		title={getAdminName(member)}
		subtitle={`@${member.username} · ${member.playfabId ?? "No PlayFab ID"}`}
	>
		<svelte:fragment slot="leading">
			<AvatarUser src={member.avatarUrl} size={44} class="member-avatar" fallbackTone="muted" />
		</svelte:fragment>
		<svelte:fragment slot="trailing">
			{#if member.isOwner}<span class="member-owner">Owner</span>{/if}
			{#if canAdmin && !member.isOwner}
				<IconButton
					icon="fa-xmark"
					ariaLabel={`Remove ${getAdminName(member)}`}
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
		aria-label={`${getAdminName(member)} permissions`}
	>
		{#each actions as action}
			<div class="team-member-row__permission" use:tooltip={permissionHelp[action]}>
				<Checkbox
					label={action}
					checked={member.isOwner || member.permissions.includes(action)}
					disabled={member.isOwner || !canAdmin || busy}
					onChange={(enabled) => onPermission(action, enabled)}
				/>
			</div>
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
	.team-member-row__permission { display: inline-flex; justify-self: start; align-items: center; }
	.team-member-row :global(.member-avatar) {
		border: 1px solid var(--color-dark-tertiary);
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
