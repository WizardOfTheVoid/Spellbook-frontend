<script lang="ts">
	import type { JsonRecord } from "$lib/utils/records";
	import {
		formatComponentDetail,
		formatDatabaseDetail,
		formatGameDetail,
		formatLatency,
		formatOverlayDetail,
		formatPlayFabDetail,
		formatRunning,
		getHealthRunning,
	} from "$lib/utils/healthUtils";
	import HealthCard from "./HealthCard.svelte";
	import TileGrid from "$lib/components/ui/TileGrid.svelte";

	export let overlayHealth: JsonRecord | null;
	export let coreHealth: JsonRecord | null;
	export let serverHealth: JsonRecord | null;
	export let databaseHealth: JsonRecord | null;
	export let playFabHealth: JsonRecord | null;
	export let tornBannerHealth: JsonRecord | null;
	export let gameHealth: JsonRecord | null;

	$: healthCards = [
		{
			label: "Overlay",
			source: overlayHealth,
			detail: formatOverlayDetail(overlayHealth),
		},
		{
			label: "Core",
			source: coreHealth,
			detail: formatComponentDetail(coreHealth),
		},
		{
			label: "Server",
			source: serverHealth,
			detail: formatComponentDetail(serverHealth),
		},
		{
			label: "DB",
			source: databaseHealth,
			detail: formatDatabaseDetail(databaseHealth),
		},
		{
			label: "PlayFab",
			source: playFabHealth,
			detail: formatPlayFabDetail(playFabHealth),
		},
		{
			label: "Torn Banner",
			source: tornBannerHealth,
			detail: formatPlayFabDetail(tornBannerHealth),
		},
		{ label: "Game", source: gameHealth, detail: formatGameDetail(gameHealth) },
	];
</script>

<TileGrid columns={2}>
	{#each healthCards as card (card.label)}
		<HealthCard
			label={card.label}
			running={getHealthRunning(card.source)}
			status={formatRunning(getHealthRunning(card.source))}
			detail={card.detail}
			latency={formatLatency(card.source)}
		/>
	{/each}
</TileGrid>
