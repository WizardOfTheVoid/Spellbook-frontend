<script lang="ts">
	import { onMount, untrack } from "svelte";
	import {
		navigation,
		rememberNavigation,
		navigationScroll,
	} from "$lib/navigation/navigation";
	import type { GameServerProfile, GameServerRecord } from "$lib/core";
	import type { PlayerState } from "$lib/types/playerState";
	import Tabs from "$lib/components/ui/tabs.svelte";
	import Button from "$lib/components/ui/Button.svelte";
	import AvatarTeam from '$lib/components/ui/avatars/avatarTeam.svelte'
	import GameServerPlayers from "./GameServerPlayers.svelte";
	import Tile from "$lib/components/ui/Tile.svelte";
	import TileGrid from "$lib/components/ui/TileGrid.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import InfoNotice from "$lib/components/ui/infoNotice.svelte";
	import { serverTechnicalDetails } from "./overview/serverOverviewPresentation";
	import ServerOverview from "./overview/serverOverview.svelte";
	import { expireSummary } from "$lib/serverStore/liveSummary";

	let {
		server,
		profile = null,
		detailLoading = false,
		detailError = null,
		saving = false,
		active = true,
		onSelectPlayer,
		onRetry,
	}: {
		server: GameServerRecord;
		profile?: GameServerProfile | null;
		detailLoading?: boolean;
		detailError?: string | null;
		saving?: boolean;
		active?: boolean;
		onSelectPlayer: (player: PlayerState) => void;
		onRetry: () => void;
	} = $props();

	type ServerView = `overview` | `players` | `technical`;
	let view = $state<ServerView>(`overview`);
	let receivedAt = $state(Date.now());
	let now = $state(Date.now());
	let documentVisible = $state(true);
	let loadedId = 0;
	let loadedLive: GameServerProfile[`live`];
	const currentServer = $derived(
		profile?.gameServer.id === server.id ? profile.gameServer : server,
	);
	const technical = $derived(serverTechnicalDetails(currentServer));
	const live = $derived(
		profile?.live ? expireSummary(profile.live, receivedAt, now) : null,
	);
	const enabled = $derived(active && documentVisible);
	const owner = $derived(profile?.ownerTeam ?? null);
	const tabs = $derived([
		{ value: `overview`, label: `Overview` },
		...(profile?.canViewPlayers ?
			[
				{
					value: `players`,
					label: `(${live?.population.count ?? `—`}/${live?.maxPlayers ?? currentServer.maxPlayers ?? `—`}) Players`,
				},
			]
		:	[]),
		{ value: `technical`, label: `Technical` },
	]);
	const context = $derived(
		[currentServer.mapName, currentServer.gameMode, currentServer.region]
			.filter(Boolean)
			.join(` · `),
	);
	$effect(() => {
		const nextProfile = profile;
		const id = server.id;
		untrack(() => {
			if (loadedId !== id) {
				loadedId = id;
				view = `overview`;
			}
			if (loadedLive !== nextProfile?.live) {
				loadedLive = nextProfile?.live;
				receivedAt = Date.now();
			}
			if (nextProfile && !tabs.some((tab) => tab.value === view)) {
				view = `overview`;
			}
		});
	});
	onMount(() => {
		const visible = () => {
			documentVisible = !document.hidden;
		};
		visible();
		document.addEventListener(`visibilitychange`, visible);
		const timer = window.setInterval(() => {
			if (enabled) now = Date.now();
		}, 1000);
		return () => {
			window.clearInterval(timer);
			document.removeEventListener(`visibilitychange`, visible);
		};
	});
	async function selectView(value: string) {
		if (value === view) return;
		await navigation.visit(() => {
			view = value as ServerView;
		});
	}
	rememberNavigation(
		`serverTab`,
		() => view,
		(value) => {
			view = tabs.some((tab) => tab.value === value) ? value : `overview`;
		},
	);
</script>

<div class="server-editor panel-subview" use:navigationScroll={`serverEditor`}>
	<div class="server-identity">
		{#if owner}
			<AvatarTeam src={owner.logo} size={32} />
			<div><small>Owner Team</small><strong>{owner.name}</strong></div>
		{:else if !detailLoading}<span class="unclaimed">Unclaimed</span>{/if}
		{#if context}<small class="server-context">{context}</small>{/if}
	</div>
	<Tabs
		items={tabs}
		value={view}
		label="Server sections"
		onChange={(value) => void selectView(value)}
	>
		{#if detailLoading && !profile}<small role="status"
				>Loading server details...</small
			>{/if}
		{#if detailError}<div class="detail-error" role="status">
				<InfoNotice message={detailError} /><Button
					label="Retry"
					size="sm"
					disabled={saving || detailLoading}
					onClick={onRetry}
				/>
			</div>{/if}

		{#if view === `overview`}
			<ServerOverview server={currentServer} {live} active={enabled} />
		{:else if view === `players` && profile?.canViewPlayers}
			<GameServerPlayers
				gameServerId={server.id}
				active={enabled}
				onSelect={onSelectPlayer}
			/>
		{:else if view === `technical`}
			<section class="server-technical" aria-label="Technical details">
				<h2>Technical details</h2>
				{#if technical.pending}
					<EmptyState
						title="Location pending"
						message="Location information is not available for this server... Yet."
					/>
				{:else}
					{#if !technical.hasLocation}<EmptyState
							title="Location unavailable"
							message="The lookup returned no location information."
						/>{/if}
					<TileGrid
						>{#each technical.fields as field}<Tile
								title={String(field.value ?? `Unavailable`)}
								subtitle={field.label}
							/>{/each}</TileGrid
					>
					{#if technical.hasCoordinates}<InfoNotice
							message="Coordinates show an estimated location :]"
						/>{/if}
				{/if}
			</section>
		{/if}
	</Tabs>
</div>

<style lang="scss">
	.server-editor {
		container-type: inline-size;
		container-name: server-detail;
		min-width: 0;
		min-height: 0;
		display: grid;
		align-content: start;
		gap: var(--gutter-lg);
		padding: 0 var(--gutter-lg) var(--gutter-lg);
		overflow: auto;
	}
	.server-identity {
		display: flex;
		align-items: center;
		flex-wrap: wrap;
		gap: var(--gutter-sm) var(--gutter-md);
		min-width: 0;
	}
	.server-identity > div {
		display: grid;
		gap: 3px;
		min-width: 0;
		flex: 1 1 160px;
	}
	small,
	.unclaimed {
		color: var(--color-light-tertiary);
		font-size: var(--font-size-caption);
	}
	.server-identity strong {
		overflow-wrap: anywhere;
	}
	.server-context {
		margin-left: auto;
		overflow-wrap: anywhere;
	}
	.server-technical {
		display: grid;
		gap: var(--gutter-lg);
		min-width: 0;
	}
	h2 {
		margin: 0;
		font-size: var(--font-size-lg);
		font-weight: var(--font-weight-medium);
	}
	.detail-error {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--gutter-md);
	}
	.server-editor :global(.tabs__list button) {
		white-space: nowrap;
		padding-inline: var(--gutter-sm);
	}
	.server-editor :global(.tabs__list button[role="tab"]:nth-child(2)) {
		flex-grow: 1.6;
	}
	@container server-detail (max-width: 420px) {
		.server-editor :global(.tile-grid) {
			grid-template-columns: 1fr;
		}
	}
	@container server-detail (max-width: 380px) {
		.server-editor :global(.tabs__list button) {
			font-size: var(--font-size-caption);
		}
	}
</style>
