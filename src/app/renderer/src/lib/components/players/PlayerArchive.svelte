<script lang="ts">
	import { onDestroy } from "svelte";
	import type { PlayerEntry, WantedPlayerListItem } from "$lib/core";
	import { authState } from "$lib/auth/user";
	import type { PlayerState } from "$lib/types/playerState";
	import type { LoadState } from "$lib/types/ui";
	import {
		createPlayerQuery,
		createDefaultPlayerFilters,
		createPlayerArchiveResetState,
		createPlayerArchiveSession,
		createPlayerArchiveSessionState,
		countAdvancedPlayerFilters,
		defaultPlayerFilters,
		hasBackendPlayerFilters,
		hidePlayersWhileLoading,
		preparePlayerArchiveLoad,
		resolveFailedRosterPlayers,
		transformPlayerArchive,
		type PlayerArchiveResult,
		type PlayerArchiveSession,
		type PlayerFilterState,
	} from "$lib/utils/playerArchive";
	import { createLatestRequestTracker, createQueryDebouncer } from "$lib/utils/archiveRequests";
	import { getPlayerFilterChips, togglePlayerFilter } from "$lib/utils/playerFilters";
	import { createDbPlayerState, mergeLivePlayersWithDb } from "$lib/utils/playerStateData";
	import { getPlayers, type PlayerListMeta } from "$lib/utils/playersApi";
	import { getWantedPlayers } from "$lib/utils/wantedPlayersApi";
	import AdvancedPlayerFilters from "./AdvancedPlayerFilters.svelte";
	import PlayerRow from "./PlayerRow.svelte";
	import WantedPlayerRow from "./WantedPlayerRow.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import FilterChipRow from "$lib/components/ui/FilterChipRow.svelte";
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import PaginationControls from "$lib/components/ui/PaginationControls.svelte";
	import SearchField from "$lib/components/ui/SearchField.svelte";

	export let active = true;
	export let source: "players" | "wanted" = "players";
	export let livePlayers: PlayerEntry[] | null = null;
	export let refreshRevision = 0;
	export let silentRefresh = false
	export let onSelect: (player: PlayerState) => void;
	export let onOpenProfile: (player: PlayerState) => void = onSelect
	export let onResult: (result: PlayerArchiveResult) => void = () => {};
	export let onRequestPendingChange: (pending: boolean) => void = () => {}
	export let onWantedMutated: () => void = () => {}
	export let session: PlayerArchiveSession | null = null

	const initialNavigationState = session?.bind($authState.user)
	let page = initialNavigationState?.page ?? 1;
	let sessionPage = page
	let searchInput = initialNavigationState?.search ?? "";
	let search = initialNavigationState?.search ?? "";
	let filters: PlayerFilterState = initialNavigationState?.filters ?? createDefaultPlayerFilters()
	let queryFilters: PlayerFilterState = initialNavigationState
		? { ...initialNavigationState.filters }
		: createDefaultPlayerFilters()
	let activeChipIds: string[] = initialNavigationState?.activeChipIds ?? [];
	let advancedFiltersOpen = initialNavigationState?.advancedFiltersOpen ?? false;
	let sourcePlayers: PlayerState[] = [];
	let wantedByPlayerId = new Map<number, WantedPlayerListItem>();
	let rosterPlayers: PlayerState[] | null = null;
	let meta = emptyMeta(page);
	let state: LoadState = "idle";
	let error: string | null = null;
	let refreshedAt: string | null = null;
	let lastRequestKey = "";
	let lastIncludeKey: string | null = null;
	let lastResultKey = "";
	let mode: "database" | "live";
	let archiveUser = $authState.user
	let activeSession = session
	const queryDebouncer = createQueryDebouncer<{ search: string; filters: PlayerFilterState }>(({ search: nextSearch, filters: nextFilters }) => {
		page = 1;
		sessionPage = 1
		search = nextSearch;
		queryFilters = nextFilters;
	})
	const requestTracker = createLatestRequestTracker(
		(pending) => onRequestPendingChange(pending),
	)

	$: mode = livePlayers === null ? "database" : "live";
	$: if ($authState.user !== archiveUser || session !== activeSession) {
		archiveUser = $authState.user
		activeSession = session
		rebindSession(session?.bind(archiveUser))
	}
	$: include = livePlayers === null
		? undefined
		: [...new Set(livePlayers.map(({ playfabId }) => playfabId))].sort();
	$: includeKey = include?.join("|") ?? "database";
	$: if (includeKey !== lastIncludeKey) {
		if (lastIncludeKey !== null) {
			page = 1;
			sessionPage = 1
		}
		lastIncludeKey = includeKey;
	}
	$: chips = getPlayerFilterChips(mode)
	$: advancedFilterCount = countAdvancedPlayerFilters(filters, mode)
	$: archiveFilters = mode === "database"
		? queryFilters
		: {
			...queryFilters,
			sortBy: defaultPlayerFilters.sortBy,
			sortOrder: defaultPlayerFilters.sortOrder,
		}
	$: query = createPlayerQuery({ page, search, include, activeChipIds, filters: archiveFilters });
	$: queryKey = JSON.stringify(query);
	$: requestKey = `${source}:${refreshRevision}:${queryKey}`;
	$: visiblePlayers = hidePlayersWhileLoading(
		transformPlayerArchive(sourcePlayers, mode, activeChipIds),
		state,
	);
	$: backendFiltered = hasBackendPlayerFilters(search, activeChipIds, queryFilters);
	$: session?.save(createPlayerArchiveSessionState({
		page: sessionPage,
		searchInput,
		filters,
		activeChipIds,
		advancedFiltersOpen
	}))
	$: if (active) {
		if (requestKey !== lastRequestKey) {
			lastRequestKey = requestKey;
			void loadPlayers(query, backendFiltered);
		}
	} else {
		lastRequestKey = "";
		requestTracker.cancel()
	}
	$: {
		const resultKey = JSON.stringify({
			state,
			meta,
			refreshedAt,
			error,
			rosterPlayers: rosterPlayers?.map(({ playfabId, name }) => [playfabId, name]),
			players: visiblePlayers.map(({ playfabId, kills, pingMs }) => [playfabId, kills, pingMs]),
		});
		if (resultKey !== lastResultKey) {
			lastResultKey = resultKey;
			onResult({ players: visiblePlayers, meta, state, refreshedAt, error, rosterPlayers });
		}
	}

	onDestroy(() => {
		queryDebouncer.cancel()
		requestTracker.cancel()
	})

	async function loadPlayers(
		currentQuery: typeof query,
		currentBackendFiltered: boolean,
	): Promise<void> {
		const version = requestTracker.start()
		const roster = livePlayers;
		const silent = silentRefresh
		const loadStart = preparePlayerArchiveLoad(state, sourcePlayers, silent)
		state = loadStart.state
		error = null;
		sourcePlayers = loadStart.players

		try {
			const [result, rosterPage] = await Promise.all([
				source === "wanted" ? getWantedPlayers(currentQuery) : getPlayers(currentQuery),
				roster !== null && currentBackendFiltered
					? getPlayers({ include: currentQuery.include ?? [] })
					: Promise.resolve(null),
			]);
			if (!requestTracker.isCurrent(version)) return;
			meta = result.meta;
			wantedByPlayerId = source === "wanted"
				? new Map(result.players.flatMap(player => "wanted" in player
					? [[player.id, player] as const]
					: []))
				: new Map();
			sourcePlayers = roster === null
				? result.players.map(createDbPlayerState)
				: mergeLivePlayersWithDb(roster, result.players);
			rosterPlayers = roster === null
				? null
				: transformPlayerArchive(
					mergeLivePlayersWithDb(roster, (rosterPage ?? result).players),
					"live",
					[],
				);
			state = "ok";
			refreshedAt = new Date().toISOString();
		} catch (reason) {
			if (!requestTracker.isCurrent(version)) return;
			meta = emptyMeta(page);
			rosterPlayers = resolveFailedRosterPlayers(
				rosterPlayers,
				roster !== null,
				silent,
			)
			error = reason instanceof Error ? reason.message : "Players request failed.";
			state = "error";
		} finally {
			requestTracker.settle(version)
		}
	}

	function handleSearchInput(): void {
		sessionPage = 1
		queryDebouncer.schedule({ search: searchInput, filters })
	}

	function handleFilters(next: PlayerFilterState): void {
		filters = next
		sessionPage = 1
		queryDebouncer.schedule({ search: searchInput, filters: next })
	}

	function handleChip(id: string): void {
		activeChipIds = togglePlayerFilter(activeChipIds, id);
		if (id !== "non-eu") {
			page = 1;
			sessionPage = 1
		}
	}

	function resetFilters(): void {
		queryDebouncer.cancel()
		const reset = createPlayerArchiveResetState()
		page = reset.page
		sessionPage = reset.page
		searchInput = reset.searchInput
		search = reset.search
		filters = reset.filters
		queryFilters = reset.queryFilters
		activeChipIds = reset.activeChipIds
	}

	function rebindSession(next: ReturnType<PlayerArchiveSession["load"]> | undefined): void {
		queryDebouncer.cancel()
		requestTracker.cancel()
		const navigation = next ?? createPlayerArchiveSession().load()
		page = navigation.page
		sessionPage = navigation.page
		searchInput = navigation.search
		search = navigation.search
		filters = { ...navigation.filters }
		queryFilters = { ...navigation.filters }
		activeChipIds = [...navigation.activeChipIds]
		advancedFiltersOpen = navigation.advancedFiltersOpen
		sourcePlayers = []
		wantedByPlayerId = new Map()
		rosterPlayers = null
		meta = emptyMeta(page)
		state = "idle"
		error = null
		refreshedAt = null
		lastRequestKey = ""
		lastResultKey = ""
	}

	function emptyMeta(currentPage: number): PlayerListMeta {
		return {
			currentPage,
			pageSize: 100,
			totalPages: 0,
			totalResults: 0,
			hasPrevious: currentPage > 1,
			hasNext: false,
		};
	}

	function changePage(nextPage: number): void {
		page = nextPage
		sessionPage = nextPage
	}
</script>

<div class="player-archive">
	<div class="player-archive__filters">
		<SearchField
			bind:value={searchInput}
			placeholder="Search for ID, clan, name, etc ..."
			tooltip="Search PlayFab IDs and current or previous player names."
			onInput={handleSearchInput}
		>
			<svelte:fragment slot="trailing">
				<IconButton
					icon="fa-sliders"
					size="md"
					shape="rounded"
					position="absolute"
					ariaLabel={`Advanced filters${advancedFilterCount ? ` (${advancedFilterCount} active)` : ``}`}
					expanded={advancedFiltersOpen}
					controls="advanced-player-filters"
					hasPopup={null}
					tooltip="Open additional player filters."
					badge={advancedFilterCount || null}
					active={advancedFiltersOpen || advancedFilterCount > 0}
					onClick={() => (advancedFiltersOpen = !advancedFiltersOpen)}
				/>
			</svelte:fragment>
		</SearchField>

		{#if advancedFiltersOpen}
			<AdvancedPlayerFilters {filters} {mode} onChange={handleFilters} />
		{/if}

		{#if source !== "wanted"}
			<FilterChipRow {chips} selected={activeChipIds} onToggle={handleChip} onReset={resetFilters} resetTooltip="Clear search and all player filters." />
		{/if}
	</div>

	<div class="player-archive__body" aria-busy={state === "loading"}>
		{#if state === "loading"}
			<div class="player-archive__loader" role="status" aria-live="polite">
				<span class="player-archive__loader-target" aria-hidden="true"><i></i></span>
				<strong>Loading players</strong>
				<span class="player-archive__loader-dots" aria-hidden="true"><i></i><i></i><i></i></span>
			</div>
		{/if}

		{#each visiblePlayers as player (player.playfabId)}
			{#if source === "wanted" && player.dbId && wantedByPlayerId.has(player.dbId)}
				{@const wantedPlayer = wantedByPlayerId.get(player.dbId) as WantedPlayerListItem}
				<WantedPlayerRow
					{player}
					wanted={wantedPlayer.wanted}
					banCount={wantedPlayer.banCount}
					noteCount={wantedPlayer.noteCount}
					{onSelect}
					{onOpenProfile}
					onMutated={onWantedMutated}
				/>
			{:else}
				<PlayerRow {player} {mode} {onSelect} />
			{/if}
		{:else}
			{#if state === "error"}
				<EmptyState
					title={source === "wanted" ? "Wanted list unavailable" : "Player archive unavailable"}
					message={error ?? (source === "wanted" ? "Wanted players request failed." : "Players request failed.")}
				/>
			{:else if state !== "loading"}
				<EmptyState
					title={source === "wanted" ? "No wanted players" : "No players"}
					message={search || activeChipIds.length > 0
						? `No ${source === "wanted" ? "wanted " : ""}players match the current search and filters.`
						: source === "wanted"
							? "No players are currently wanted."
							: "No player records are available."}
				/>
			{/if}
		{/each}

	</div>

	<div class="player-archive__pagination">
		<PaginationControls
			currentPage={meta.currentPage}
			totalPages={meta.totalPages}
			hasPrevious={meta.hasPrevious}
			hasNext={meta.hasNext}
			disabled={state === "loading"}
			onPrevious={() => changePage(Math.max(1, page - 1))}
			onNext={() => changePage(page + 1)}
		/>
	</div>
</div>

<style lang="scss">
	.player-archive {
		min-height: 0;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr) auto;
		gap: var(--gutter-lg);
	}

	.player-archive__filters {
		display: grid;
		margin: 0 var(--gutter-lg);
		gap: var(--gutter);
	}

	.player-archive__body {
		min-height: 0;
		display: grid;
		align-content: start;
		overflow: hidden auto;
		gap: var(--gutter-md);
		padding: 0 var(--gutter-lg);
	}

	.player-archive__pagination {
		padding: 0 var(--gutter-lg) var(--gutter-lg);
	}

	.player-archive__loader {
		min-height: 76px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: var(--gutter-md);
		border: 1px solid var(--color-dark-secondary);
		border-radius: var(--radius);
		color: var(--color-light-secondary);
		background: transparent;
		font-size: var(--font-size-sm);
		letter-spacing: 0.06em;
	}

	.player-archive__loader-target {
		position: relative;
		width: var(--icon-size-xxl);
		aspect-ratio: 1;
		border: 2px solid var(--color-dark-tertiary);
		border-top-color: var(--color-accent-primary);
		border-right-color: var(--color-accent-secondary);
		border-radius: 50%;
		animation: player-archive-spin 800ms linear infinite;
	}

	.player-archive__loader-target i {
		position: absolute;
		inset: 7px;
		border-radius: 50%;
		background: var(--color-accent-secondary);
		animation: player-archive-pulse 700ms ease-in-out infinite alternate;
	}

	.player-archive__loader-dots {
		display: inline-flex;
		gap: 4px;
	}

	.player-archive__loader-dots i {
		width: 4px;
		aspect-ratio: 1;
		border-radius: 50%;
		background: var(--color-accent-primary);
		animation: player-archive-pulse 700ms ease-in-out infinite alternate;
	}

	.player-archive__loader-dots i:nth-child(2) { animation-delay: 140ms; }
	.player-archive__loader-dots i:nth-child(3) { animation-delay: 280ms; }

	@keyframes player-archive-spin {
		to { transform: rotate(1turn); }
	}

	@keyframes player-archive-pulse {
		to { opacity: 0.25; transform: scale(0.65); }
	}

	@media (prefers-reduced-motion: reduce) {
		.player-archive__loader i,
		.player-archive__loader-target { animation: none; }
	}
</style>
