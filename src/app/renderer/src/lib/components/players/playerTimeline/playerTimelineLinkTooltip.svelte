<script lang="ts">
	import type { PlayerTimelineTarget } from "@spellbook/shared/playerTimeline";
	import type { PlayerAction } from "$lib/core";
	import { onMount } from "svelte";
	import DetailedTooltip from "$lib/components/ui/DetailedTooltip.svelte";
	import { getServerLabel } from "$lib/utils/displayNames";
	import PlayerActionTooltip from "../playerActionTooltip.svelte";
	import {
		PlayerTimelinePreviewLoader,
		type PlayerTimelinePreview,
	} from "./playerTimelinePreview";

	export let actions: PlayerAction[];
	export let previewLoader: PlayerTimelinePreviewLoader;
	export let target: PlayerTimelineTarget;

	let mounted = false;
	let version = 0;
	let preview: PlayerTimelinePreview | null = null;
	let failed = false;

	$: if (mounted) {
		const request = ++version;
		preview = null;
		failed = false;
		void load(previewLoader, target, request);
	}

	onMount(() => {
		mounted = true;
		return () => {
			version += 1;
		};
	});

	async function load(
		loader: PlayerTimelinePreviewLoader,
		destination: PlayerTimelineTarget,
		request: number,
	): Promise<void> {
		try {
			const result = await loader.get(destination);
			if (request === version) preview = result;
		} catch {
			if (request === version) failed = true;
		}
	}
</script>

{#if preview?.type === `action`}
	<PlayerActionTooltip action={preview.action} {actions} />
{:else if preview?.type === `server`}
	{@const server = preview.profile.gameServer}
	{@const a2s = server.a2s}
	{@const recent =
		a2s?.status === `fresh` &&
		a2s.observedAt &&
		Date.now() - Date.parse(a2s.observedAt) <= 60_000}
	<DetailedTooltip
		title={getServerLabel(server)}
		subtitle={`Server #${server.id}`}
	>
		{#snippet content()}
			<dl class="timeline-link-preview">
				{#if server.region}<div>
						<dt>Region</dt>
						<dd>{server.region}</dd>
					</div>{/if}
				{#if server.gameMode}<div>
						<dt>Mode</dt>
						<dd>{server.gameMode}</dd>
					</div>{/if}
				{#if server.mapName}<div>
						<dt>Map</dt>
						<dd>{server.mapName}</dd>
					</div>{/if}
				{#if typeof server.maxPlayers === `number`}<div>
						<dt>Capacity</dt>
						<dd>{server.maxPlayers} players</dd>
					</div>{/if}
				{#if recent}
					{#if typeof a2s?.ping === `number`}<div>
							<dt>Ping at check</dt>
							<dd>{a2s.ping} ms</dd>
						</div>{/if}
					{#if typeof a2s?.password === `boolean`}<div>
							<dt>Password</dt>
							<dd>{a2s.password ? `Required` : `Not required`}</dd>
						</div>{/if}
				{:else}
					<div>
						<dt>A2S status</dt>
						<dd>{a2s?.observedAt ? `Last check is stale` : `Unavailable`}</dd>
					</div>
				{/if}
			</dl>
		{/snippet}
	</DetailedTooltip>
{:else}
	<DetailedTooltip
		title={`${target.type === `server` ? `Server` : `Action`} #${target.id}`}
		subtitle={failed ? `Details unavailable` : `Loading details`}
	>
		{#snippet content()}
			<p class="timeline-link-preview__status">
				{failed ?
					`Could not load this ${target.type}.`
				:	`Loading ${target.type} details...`}
			</p>
		{/snippet}
	</DetailedTooltip>
{/if}

<style lang="scss">
	.timeline-link-preview {
		display: grid;
		gap: var(--gutter-sm);
		margin: 0;
		text-align: left;
		font-weight: inherit;
	}

	.timeline-link-preview > div {
		display: grid;
		grid-template-columns: minmax(100px, auto) minmax(0, 1fr);
		gap: var(--gutter-md);
	}

	dt {
		color: var(--color-light-tertiary);
	}
	dd {
		min-width: 0;
		margin: 0;
		overflow-wrap: anywhere;
	}
	.timeline-link-preview__status {
		margin: 0;
	}
</style>
