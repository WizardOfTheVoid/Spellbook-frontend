<script context="module" lang="ts">
	import { createPlayerArchiveSession } from "$lib/utils/playerArchive";

	const archiveSession = createPlayerArchiveSession()
</script>

<script lang="ts">
	import type { PlayerState } from "$lib/types/playerState";
	import type { PlayerSearchMode } from '$lib/utils/playerSearchSource'
	import Toggle from '$lib/components/ui/Toggle.svelte'
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import PlayerArchive from "./PlayerArchive.svelte";

	export let hidden = false;
	export let isActive = false;
	export let onSelectPlayer: (player: PlayerState) => void;

	let searchMode: PlayerSearchMode = `normal`
	let archive: { setHistoricSearch(enabled: boolean): void } | undefined
</script>

<section {hidden} class="panel-view player-list" aria-label="Database players">
	<PanelHeader title="Players" eyebrow="Database">
		<svelte:fragment slot="trailing">
			<Toggle label="Historic" tooltip="Include old historic players"
				checked={searchMode === `historic`} onChange={enabled => archive?.setHistoricSearch(enabled)} />
		</svelte:fragment>
	</PanelHeader>

	<PlayerArchive
		bind:this={archive}
		bind:searchMode
		showHistoricSearchButton={false}
		active={isActive}
		source="players"
		session={archiveSession}
		onSelect={onSelectPlayer}
	/>
</section>

<style lang="scss">
	.player-list {
		box-sizing: border-box;
		padding-top: var(--gutter-lg);
		height: 100%;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
		align-content: start;
		gap: var(--gutter-lg);
	}
</style>
