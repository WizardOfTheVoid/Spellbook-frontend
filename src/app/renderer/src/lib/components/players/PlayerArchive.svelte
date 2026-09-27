<script lang="ts">
	import { navigation, rememberNavigation, navigationScroll } from "$lib/navigation/navigation"
	import { onDestroy } from "svelte";
	import type { PlayerEntry, WantedPlayerListItem } from "$lib/core";
	import { authState } from "$lib/auth/user";
	import type { PlayerState } from "$lib/types/playerState";
	import type { LoadState } from "$lib/types/ui";
	import {
		createPlayerQuery,
		createDefaultPlayerFilters,
		createPlayerArchiveSession,
		createPlayerArchiveSessionState,
		defaultPlayerFilters,
		hasBackendPlayerFilters,
		hidePlayersWhileLoading,
		preparePlayerArchiveLoad,
		pagePreparedRoster,
		type PreparedPlayerRoster,
		resolveFailedRosterPlayers,
		transformPlayerArchive,
		type PlayerArchiveResult,
		type PlayerArchiveSession,
		type PlayerFilterState,
	} from "$lib/utils/playerArchive";
	import { createLatestRequestTracker, createQueryDebouncer } from "$lib/utils/archiveRequests";
	import { availablePlayerFilterIds, getPlayerFilterChips, togglePlayerFilter } from "$lib/utils/playerFilters";
	import { activePlayerFilterTags, clearPlayerArchiveFilters, effectivePlayerFilterIds, playerViewPresets, removeAdvancedPlayerFilter, removePlayerFilterTag, shouldHidePlayerFilterTags, togglePlayerView, type ActivePlayerViewId, type PlayerFilterTag } from "$lib/utils/playerArchiveControls"
	import { closeInfinityMenu, infinityMenuSeparator, infinityMenuState, openInfinityMenu, type InfinityMenuItem } from "$lib/components/ui/infinityMenu"
	import { createDbPlayerState, mergeLivePlayersWithDb } from "$lib/utils/playerStateData";
	import { getPlayers, type PlayerListMeta } from "$lib/utils/playersApi";
	import { getWantedPlayers } from "$lib/utils/wantedPlayersApi";
	import PlayerFiltersModal from "./playerFiltersModal.svelte"
	import PlayerArchiveEmpty from "./playerArchiveEmpty.svelte"
	import PlayerRow from "./PlayerRow.svelte";
	import WantedPlayerRow from "./WantedPlayerRow.svelte";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import Icon from "$lib/components/ui/Icon.svelte"
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import BadgeBubble from "$lib/components/ui/badgeBubble.svelte"
	import PaginationControls from "$lib/components/ui/PaginationControls.svelte";
	import SearchField from "$lib/components/ui/SearchField.svelte";

	export let active = true;
	export let source: "players" | "wanted" = "players";
	export let livePlayers: PlayerEntry[] | null = null;
	export let preparedRoster: PreparedPlayerRoster | null = null
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
	let filters: PlayerFilterState = initialNavigationState?.filters ?? createDefaultPlayerFilters(source)
	let queryFilters: PlayerFilterState = initialNavigationState
		? { ...initialNavigationState.filters }
		: createDefaultPlayerFilters(source)
	let activeChipIds: string[] = initialNavigationState?.activeChipIds ?? [];
	let viewIds: ActivePlayerViewId[] = initialNavigationState?.viewIds ?? (initialNavigationState?.viewId && initialNavigationState.viewId !== `all` ? [initialNavigationState.viewId] : [])
	let advancedFiltersOpen = initialNavigationState?.advancedFiltersOpen ?? false;
	let tagsHidden = false
	let previousScrollPosition = { top: 0, maxTop: 0 }
	let menuOwner: HTMLElement | null = null
	let viewButton: HTMLButtonElement
	let sortButton: HTMLButtonElement
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
	$: effectiveChipIds = effectivePlayerFilterIds(viewIds, activeChipIds)
	$: activeTags = activePlayerFilterTags(filters, viewIds, activeChipIds)
	$: advancedFilterCount = activePlayerFilterTags(filters, [], activeChipIds).length
	$: viewName = viewIds.length === 0 ? `All players` : viewIds.length === 1 ? playerViewPresets.find(view => view.id === viewIds[0])?.name ?? viewIds[0] : `${viewIds.length} views selected`
	$: sortName = filters.sortBy === `wantedAt` ? `Last added` : filters.sortBy === `lastSeen` ? `Last seen` : filters.sortBy === `accountCreated` ? `Account created` : `Rank`
	$: sortIcon = filters.sortOrder === `asc` ? `fa-arrow-up-wide-short` : `fa-arrow-down-wide-short`
	$: archiveFilters = queryFilters
	$: query = createPlayerQuery({ page, search, include, activeChipIds: effectiveChipIds, filters: archiveFilters });
	$: isSearch = Boolean(query.search)
	$: queryKey = JSON.stringify(query);
	$: requestKey = `${source}:${refreshRevision}:${queryKey}`;
	$: visiblePlayers = hidePlayersWhileLoading(
		transformPlayerArchive(sourcePlayers, mode, effectiveChipIds, archiveFilters),
		state,
	);
	$: backendFiltered = hasBackendPlayerFilters(search, effectiveChipIds, queryFilters);
	$: session?.save(createPlayerArchiveSessionState({
		page: sessionPage,
		searchInput,
		filters,
		activeChipIds,
		viewIds,
		advancedFiltersOpen
	}))
	$: if (active) {
		if (mode === `live` && preparedRoster && !backendFiltered) {
			requestTracker.cancel()
			lastRequestKey = requestKey
			const result = pagePreparedRoster({ ...preparedRoster, players: transformPlayerArchive(preparedRoster.players, `live`, effectiveChipIds, archiveFilters) }, page)
			sourcePlayers = result.players
			rosterPlayers = result.rosterPlayers
			meta = result.meta
			state = result.state
			error = result.error
			refreshedAt = result.refreshedAt
		} else if (requestKey !== lastRequestKey) {
			lastRequestKey = requestKey;
			void loadPlayers(query, backendFiltered);
		}
	} else {
		lastRequestKey = "";
		requestTracker.cancel()
	}
	$: {
		const resultKey = JSON.stringify({
			isSearch,
			state,
			meta,
			refreshedAt,
			error,
			rosterPlayers: rosterPlayers?.map(({ playfabId, name }) => [playfabId, name]),
			players: visiblePlayers.map(({ playfabId, kills, pingMs }) => [playfabId, kills, pingMs]),
		});
		if (resultKey !== lastResultKey) {
			lastResultKey = resultKey;
			onResult({ players: visiblePlayers, meta, state, refreshedAt, error, rosterPlayers, isSearch });
		}
	}

	onDestroy(() => {
		queryDebouncer.cancel()
		requestTracker.cancel()
		if (menuOwner && $infinityMenuState?.owner === menuOwner) closeInfinityMenu()
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
				roster !== null && currentBackendFiltered && !preparedRoster
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
				: preparedRoster?.players ?? transformPlayerArchive(
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
		if (next.minRank !== filters.minRank || next.maxRank !== filters.maxRank) {
			activeChipIds = activeChipIds.filter(id => id !== `no-rank`)
		}
		filters = next
		sessionPage = 1
		queryDebouncer.schedule({ search: searchInput, filters: next })
	}

	function handleChip(id: string): void {
		if (id === `no-rank`) viewIds = viewIds.filter(viewId => viewId !== `low-rank`)
		activeChipIds = togglePlayerFilter(activeChipIds, id);
		page = 1
		sessionPage = 1
	}

	function selectView(next: ActivePlayerViewId | `all`): void {
		viewIds = togglePlayerView(viewIds, next)
		if (next === `low-rank` && viewIds.includes(`low-rank`)) activeChipIds = activeChipIds.filter(id => id !== `no-rank`)
		page = 1
		sessionPage = 1
	}

	function openViewMenu(event: MouseEvent): void {
		const trigger = event.currentTarget as HTMLElement
		menuOwner = trigger
		const items: InfinityMenuItem[] = [{ name: `All players`, subtitle: `Clear selected views`, icon: `fa-users`, action: () => selectView(`all`) }, ...playerViewPresets.map(preset => ({
			name: preset.name, subtitle: preset.subtitle, icon: preset.icon,
			iconType: preset.id === `online` ? `solid` as const : undefined,
			iconColor: preset.id === `online` ? `var(--color-accent-secondary)` : undefined,
			toggle: { checked: viewIds.includes(preset.id), onChange: () => selectView(preset.id) }
		}))]
		openInfinityMenu({ name: `Select views`, subtitle: `Combine presets to narrow the list.`, icon: `fa-users`, placement: `bottom`, items }, { x: event.clientX, y: event.clientY }, trigger)
	}

	function openSortMenu(event: MouseEvent): void {
		const trigger = event.currentTarget as HTMLElement
		menuOwner = trigger
		const fields: { value: PlayerFilterState[`sortBy`], name: string, icon: string }[] = [
			...(source === `wanted` ? [{ value: `wantedAt` as const, name: `Last added to Wanted`, icon: `fa-clock` }] : []),
			{ value: `lastSeen`, name: `Last seen`, icon: `fa-clock` },
			{ value: `rank`, name: `Rank`, icon: `fa-chart-simple` },
			{ value: `accountCreated`, name: `Account created`, icon: `fa-calendar` }
		]
		const items: InfinityMenuItem[] = [
			...fields.map(field => ({ name: field.name, icon: field.icon, toggle: { checked: filters.sortBy === field.value, group: `sort-field`, onChange: () => handleFilters({ ...filters, sortBy: field.value }) } })),
			infinityMenuSeparator,
			{ name: `Descending`, icon: `fa-arrow-down-wide-short`, toggle: { checked: filters.sortOrder === `desc`, group: `sort-direction`, onChange: () => handleFilters({ ...filters, sortOrder: `desc` }) } },
			{ name: `Ascending`, icon: `fa-arrow-up-wide-short`, toggle: { checked: filters.sortOrder === `asc`, group: `sort-direction`, onChange: () => handleFilters({ ...filters, sortOrder: `asc` }) } }
		]
		openInfinityMenu({ name: `Sort players`, subtitle: `Choose a field and direction.`, icon: sortIcon, placement: `bottom`, items }, { x: event.clientX, y: event.clientY }, trigger)
	}

	function clearFilters(): void {
		const cleared = clearPlayerArchiveFilters(filters, source)
		queryDebouncer.cancel()
		viewIds = cleared.viewIds
		activeChipIds = cleared.chipIds
		filters = cleared.filters
		queryFilters = cleared.filters
		page = 1
		sessionPage = 1
	}

	function removeTag(tag: PlayerFilterTag): void {
		const isChip = activeChipIds.includes(tag.id)
		const next = removePlayerFilterTag({ viewIds, chipIds: activeChipIds }, tag.key)
		viewIds = next.viewIds
		activeChipIds = next.chipIds
		if (tag.origin === `filter` && !isChip) {
			queryDebouncer.cancel()
			filters = removeAdvancedPlayerFilter(filters, tag.id)
			queryFilters = filters
		}
		page = 1
		sessionPage = 1
	}

	function handleArchiveScroll(event: Event): void {
		const body = event.currentTarget as HTMLElement
		const position = { top: body.scrollTop, maxTop: Math.max(0, body.scrollHeight - body.clientHeight) }
		tagsHidden = shouldHidePlayerFilterTags(position, previousScrollPosition, tagsHidden)
		previousScrollPosition = position
	}

	function resetSearch(): void {
		searchInput = ``
		handleSearchInput()
	}

	function rebindSession(next: ReturnType<PlayerArchiveSession["load"]> | undefined): void {
		queryDebouncer.cancel()
		requestTracker.cancel()
		const navigation = next ?? createPlayerArchiveSession(source).load()
		page = navigation.page
		sessionPage = navigation.page
		searchInput = navigation.search
		search = navigation.search
		filters = { ...defaultPlayerFilters, ...navigation.filters }
		queryFilters = { ...filters }
		activeChipIds = availablePlayerFilterIds(navigation.activeChipIds)
		viewIds = navigation.viewIds ?? (navigation.viewId && navigation.viewId !== `all` ? [navigation.viewId] : [])
		advancedFiltersOpen = navigation.advancedFiltersOpen
		tagsHidden = false
		previousScrollPosition = { top: 0, maxTop: 0 }
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
	rememberNavigation(`playerArchive`, () => ({ page, sessionPage, searchInput, search, filters, queryFilters, activeChipIds, advancedFiltersOpen, viewIds }), value => {
		({ page, sessionPage, searchInput, search, filters, queryFilters, activeChipIds, advancedFiltersOpen, viewIds } = value)
		filters = { ...defaultPlayerFilters, ...filters }
		queryFilters = { ...defaultPlayerFilters, ...queryFilters }
		activeChipIds = availablePlayerFilterIds(activeChipIds)
		queryDebouncer.cancel()
	}, () => null)
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
					controls="player-filters-dialog"
					hasPopup="dialog"
					tooltip="Open additional player filters."
					badge={advancedFilterCount || null}
					accentColor="var(--color-accent-secondary)"
					active={advancedFiltersOpen || advancedFilterCount > 0}
					onClick={() => (advancedFiltersOpen = true)}
				/>
			</svelte:fragment>
		</SearchField>

		<div class="player-archive__controls" class:player-archive__controls--hidden={tagsHidden} inert={tagsHidden}>
			<div class="player-archive__toolbar">
				{#if source !== `wanted`}
					<button bind:this={viewButton} type="button" class="player-archive__toolbar-button player-archive__toolbar-button--view" class:player-archive__toolbar-button--active={Boolean(viewButton && $infinityMenuState?.owner === viewButton)} aria-haspopup="menu" aria-expanded={Boolean(viewButton && $infinityMenuState?.owner === viewButton)} data-uisfx-ignore="true" on:click={openViewMenu}>
						<span class="player-archive__toolbar-icon"><Icon name="fa-users" size="sm" /></span><span class="player-archive__toolbar-copy"><strong>View</strong><small>{viewName}</small></span><BadgeBubble count={viewIds.length} />
					</button>
				{/if}
				<button bind:this={sortButton} type="button" class="player-archive__toolbar-button player-archive__toolbar-button--sort" class:player-archive__toolbar-button--active={Boolean(sortButton && $infinityMenuState?.owner === sortButton)} aria-haspopup="menu" aria-expanded={Boolean(sortButton && $infinityMenuState?.owner === sortButton)} aria-label={`Sort: ${sortName}, ${filters.sortOrder === `asc` ? `ascending` : `descending`}`} data-uisfx-ignore="true" on:click={openSortMenu}>
					<span class="player-archive__toolbar-icon"><Icon name={sortIcon} size="sm" /></span><span class="player-archive__toolbar-copy"><strong>Sort</strong><small>{sortName}</small></span>
				</button>
			</div>
		</div>
	</div>

	<div class="player-archive__content">
		<div class="player-archive__tag-collapse" class:player-archive__tag-collapse--hidden={tagsHidden || activeTags.length === 0} inert={tagsHidden || activeTags.length === 0}>
			<div class="player-archive__tags" role="group" aria-label="Active filters">
				{#each activeTags as tag (tag.key)}
					<button type="button" class="player-archive__tag" class:player-archive__tag--view={tag.origin === `view`} class:player-archive__tag--filter={tag.origin === `filter`} aria-label={`Remove ${tag.label} ${tag.origin}`} on:click={() => removeTag(tag)}>
						<Icon name={tag.icon} size="xs" /><span>{tag.label}</span><Icon name="fa-xmark" size="xs" />
					</button>
				{/each}
				{#if activeTags.length}<button type="button" class="player-archive__clear" on:click={clearFilters}>Clear</button>{/if}
			</div>
		</div>
		<div class="player-archive__summary">
			<strong>{meta.totalResults.toLocaleString()} players</strong>
			<span><Icon name="fa-users" size="xs" />{viewIds.length === 0 ? `Showing all players` : viewIds.length === 1 ? `Showing ${viewName.toLowerCase()} players` : `Showing ${viewIds.length} selected views`}</span>
		</div>

	<div class="player-archive__body" use:navigationScroll={`playerArchive`} on:scroll={handleArchiveScroll} aria-busy={state === "loading"}>
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
				<PlayerRow {player} {mode} {onSelect} {search} />
			{/if}
		{:else}
			{#if state === "error"}
				<EmptyState
					title={source === "wanted" ? "Wanted list unavailable" : "Player archive unavailable"}
					message={error ?? (source === "wanted" ? "Wanted players request failed." : "Players request failed.")}
				/>
			{:else if state !== "loading" && source !== `wanted` && (search || activeTags.length > 0)}
				<PlayerArchiveEmpty onClearFilters={clearFilters} onResetSearch={resetSearch} />
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
		{#if isSearch}
			<div class="player-archive__results" role="status">
				{#if state === "ok"}{visiblePlayers.length} results found{/if}
			</div>
		{:else}
			<PaginationControls
				currentPage={meta.currentPage}
				totalPages={meta.totalPages}
				hasPrevious={meta.hasPrevious}
				hasNext={meta.hasNext}
				disabled={state === "loading"}
				onPrevious={() => changePage(Math.max(1, page - 1))}
				onNext={() => changePage(page + 1)}
			/>
		{/if}
	</div>
	{#if advancedFiltersOpen}
		<PlayerFiltersModal {filters} chips={source === `wanted` ? [] : chips} selectedChipIds={activeChipIds} count={advancedFilterCount} onChange={handleFilters} onToggleChip={handleChip} onClose={() => (advancedFiltersOpen = false)} />
	{/if}
	</div>
</div>

<style lang="scss">
	.player-archive {
		min-height: 0;
		display: grid;
		grid-template-rows: auto minmax(0, 1fr);
	}

	.player-archive__filters {
		display: flex;
		flex-direction: column;
		margin: 0 var(--gutter-lg);
	}

	.player-archive__controls { display: grid; grid-template-rows: 1fr; margin-top: var(--gutter); opacity: 1; transform: translateY(0); transition: grid-template-rows var(--motion-slow) var(--motion-ease), margin-top var(--motion-slow) var(--motion-ease), opacity var(--motion-slow) var(--motion-ease), transform var(--motion-slow) var(--motion-ease); }
	.player-archive__controls--hidden { grid-template-rows: 0fr; margin-top: 0; opacity: 0; transform: translateY(-20px); }
	.player-archive__toolbar { min-height: 0; display: flex; gap: var(--gutter-sm); overflow: hidden; }
	.player-archive__toolbar-button { min-width: 0; flex: 1 1 0; min-height: 56px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; justify-items: start; gap: var(--gutter-sm); border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius); padding: var(--gutter-sm) var(--gutter-md); background: transparent; color: var(--color-light-primary); font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); text-align: left; }
	.player-archive__toolbar-button--view { --toolbar-color: var(--color-accent-primary); }
	.player-archive__toolbar-button--sort { --toolbar-color: var(--color-accent-tertiary); }
	.player-archive__toolbar-button:hover, .player-archive__toolbar-button:focus-visible, .player-archive__toolbar-button--active { border-color: var(--toolbar-color); }
	.player-archive__toolbar-icon { color: var(--toolbar-color); }
	.player-archive__toolbar-copy { min-width: 0; display: grid; gap: 3px; text-align: left; }
	.player-archive__toolbar-copy strong { font-size: var(--font-size-xs); }
	.player-archive__toolbar-copy small { min-width: 0; overflow: hidden; color: var(--color-light-tertiary); font-size: var(--font-size-xs); font-weight: var(--font-weight); line-height: 1.2; text-overflow: ellipsis; white-space: nowrap; }
	.player-archive__content { position: relative; min-height: 0; display: flex; flex-direction: column; }
	.player-archive__tag-collapse { display: grid; grid-template-rows: 1fr; margin: var(--gutter) var(--gutter-lg) 0; opacity: 1; transform: translateY(0); transition: grid-template-rows var(--motion-slow) var(--motion-ease), margin-top var(--motion-slow) var(--motion-ease), opacity var(--motion-slow) var(--motion-ease), transform var(--motion-slow) var(--motion-ease); }
	.player-archive__tag-collapse--hidden { grid-template-rows: 0fr; margin-top: 0; opacity: 0; transform: translateY(-20px); }
	.player-archive__tags { min-height: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--gutter-sm); overflow: hidden; }
	.player-archive__tag { --tag-color: var(--color-accent-secondary); display: inline-flex; align-items: center; gap: var(--gutter-sm); min-height: var(--control-height-sm); border: 1px solid rgbaa(var(--tag-color), 0.35); border-radius: 999px; padding: 0 var(--gutter-md); background: rgbaa(var(--tag-color), 0.025); color: var(--color-light-primary); font-size: var(--font-size-xs); transition: border-color var(--motion-fast) var(--motion-ease), background var(--motion-fast) var(--motion-ease); }
	.player-archive__tag--view { --tag-color: var(--color-accent-primary); }
	.player-archive__tag :global(.icon:first-child) { color: var(--tag-color); }
	.player-archive__tag:hover, .player-archive__tag:focus-visible { border-color: var(--tag-color); background: rgbaa(var(--tag-color), 0.1); }
	.player-archive__clear { margin-left: var(--gutter-sm); border: 0; background: transparent; color: var(--color-light-tertiary); font-size: var(--font-size-xs); text-decoration: underline; }
	.player-archive__clear:hover, .player-archive__clear:focus-visible { color: var(--color-light-primary); }
	.player-archive__summary { display: flex; justify-content: space-between; align-items: center; gap: var(--gutter-md); margin: var(--gutter) var(--gutter-lg) 0; border-top: 1px solid var(--color-dark-secondary); padding-top: var(--gutter-md); }
	.player-archive__summary strong { font-size: var(--font-size-md); }
	.player-archive__summary span { display: inline-flex; align-items: center; gap: var(--gutter-sm); color: var(--color-light-tertiary); font-size: var(--font-size-xs); }

	.player-archive__body {
		flex: 1;
		min-height: 0;
		display: grid;
		align-content: start;
		overflow: hidden auto;
		gap: var(--gutter-md);
		margin-top: var(--gutter);
		padding: 0 var(--gutter-lg);
	}

	.player-archive__pagination {
		margin-top: var(--gutter);
		padding: 0 var(--gutter-lg) var(--gutter-lg);
	}

	.player-archive__results {
		color: var(--color-text-secondary);
		font-size: var(--font-size-xs);
		text-align: center;
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
		.player-archive__controls, .player-archive__tag { transition: none; }
		.player-archive__tag-collapse { transition: none; }
		.player-archive__loader i,
		.player-archive__loader-target { animation: none; }
	}
</style>
