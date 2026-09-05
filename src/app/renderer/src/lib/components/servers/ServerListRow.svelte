<script lang="ts">
	import type { GameServerRecord } from "$lib/core";
	import { getServerLabel } from "$lib/utils/displayNames";
	import { createServerRowStats } from "$lib/utils/serverRowStats";
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import ListRow from "$lib/components/ui/ListRow.svelte";
	import StatChip from "$lib/components/ui/StatChip.svelte";
	import Tag from "$lib/components/ui/Tag.svelte";
	import { openServerInfinityMenu } from "./serverInfinityMenu";

	export let server: GameServerRecord;
	export let busy = false;
	export let onEdit: (server: GameServerRecord) => void;
	export let onDelete: (server: GameServerRecord) => void;
	export let onRestore: (server: GameServerRecord) => void;

	$: deleted = Boolean(server.deletedAt);
	$: stats = createServerRowStats(server);

	function openMenu(event: MouseEvent): void {
		openServerInfinityMenu(event, {
			server,
			busy,
			onEdit,
			onDelete,
			onRestore,
		});
	}
</script>

<div class="server-row" class:server-row--deleted={deleted}>
	<ListRow
		title={getServerLabel(server)}
		subtitle={server.name}
		onClick={() => onEdit(server)}
		onContextMenu={openMenu}
	>
		<svelte:fragment slot="trailing">
			{#each stats as stat (stat.id)}
				<StatChip
					icon={stat.icon}
					label={stat.label}
					value={stat.value}
					iconColor={stat.iconColor}
					showLabel={false}
				/>
			{/each}
			{#if server.clanTag}
				<Tag label={server.clanTag} icon="fa-shield-halved" />
			{/if}
			{#if deleted}
				<Tag label="Deleted" icon="fa-eye-slash" />
			{/if}
			<IconButton
				icon="fa-ellipsis-vertical"
				ariaLabel={`Actions for ${getServerLabel(server)}`}
				size="sm"
				stopPropagation
				onClick={openMenu}
			/>
		</svelte:fragment>
	</ListRow>
</div>

<style lang="scss">
	.server-row--deleted {
		opacity: 0.55;
	}
</style>
