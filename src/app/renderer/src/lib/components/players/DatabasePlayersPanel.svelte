<script context="module" lang="ts">
	import { createPlayerArchiveSession } from "$lib/utils/playerArchive";

	const archiveSession = createPlayerArchiveSession()
</script>

<script lang="ts">
	import type { PlayerState } from "$lib/types/playerState";
	import type { PlayerArchiveResult } from "$lib/utils/playerArchive";
	import { formatTime } from "$lib/utils/playerUtils";
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import PanelHeader from "$lib/components/ui/PanelHeader.svelte";
	import PlayerArchive from "./PlayerArchive.svelte";

	export let hidden = false;
	export let isActive = false;
	export let onSelectPlayer: (player: PlayerState) => void;

	let refreshRevision = 0;
	let loading = false;
	let currentPage = 1;
	let totalPages = 0;
	let lastRefresh = "--:--:--";

	function handleResult(result: PlayerArchiveResult): void {
		loading = result.state === "loading";
		currentPage = result.meta.currentPage;
		totalPages = result.meta.totalPages;
		if (result.refreshedAt) lastRefresh = formatTime(new Date(result.refreshedAt));
	}
</script>

<section {hidden} class="panel-view player-list" aria-label="Database players">
	<PanelHeader title="Players" eyebrow="Database">
		<svelte:fragment slot="trailing">
			<IconButton
				icon="fa-rotate"
				ariaLabel="Refresh database players"
				disabled={loading}
				onClick={() => (refreshRevision += 1)}
			/>
			<span>{currentPage} / {Math.max(1, totalPages)}</span>
			<time>{lastRefresh}</time>
		</svelte:fragment>
	</PanelHeader>

	<PlayerArchive
		active={isActive}
		source="players"
		session={archiveSession}
		{refreshRevision}
		onSelect={onSelectPlayer}
		onResult={handleResult}
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
