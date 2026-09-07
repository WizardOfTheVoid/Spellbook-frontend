<script lang="ts">
	import type { TeamListRecord } from "$lib/core";
	import Icon from "$lib/components/ui/Icon.svelte";
	import IconBadge from "$lib/components/ui/IconBadge.svelte";
	import ListRow from "$lib/components/ui/ListRow.svelte";
	import Tag from "$lib/components/ui/Tag.svelte";

	export let team: TeamListRecord;
	export let currentUserId: number | null;
	export let onClick: () => void;

	$: status =
		team.ownerUserId === currentUserId ? `Owner`
		: team.permissions.includes(`admin`) ? `Admin`
		: `Member`;
	$: statusIcon =
		status === `Owner` ? `fa-crown`
		: status === `Admin` ? `fa-user-shield`
		: `fa-user`;
</script>

<ListRow title={team.name} {onClick}>
	<svelte:fragment slot="leading"><IconBadge name="fa-users" /></svelte:fragment
	>
	<svelte:fragment slot="meta">
		<span class="team-meta gap-1">
			<Tag
				icon={statusIcon}
				label={status}
				tooltip="Your status in this team"
			/>
			<Tag
				icon="fa-users"
				label={`${team.memberCount ?? `—`} ${team.memberCount === 1 ? `member` : `members`}`}
			/>
			<Tag
				icon="fa-server"
				label={`${team.claimedServerCount ?? `—`} ${team.claimedServerCount === 1 ? `server` : `servers`}`}
				tooltip="Servers claimed by this team"
			/>
			<Tag
				icon="fa-sliders"
				label={`${team.profileCount ?? `—`} ${team.profileCount === 1 ? `profile` : `profiles`}`}
			/>
		</span>
	</svelte:fragment>
	<svelte:fragment slot="trailing"
		><Icon name="fa-chevron-right" /></svelte:fragment
	>
</ListRow>

<style lang="scss">
	.team-meta {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
	}
</style>
