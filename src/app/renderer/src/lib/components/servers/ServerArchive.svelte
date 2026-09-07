<script lang="ts">
	import { onDestroy } from "svelte";
	import type { GameServerListMeta, GameServerRecord } from "$lib/core";
	import { authState } from "$lib/auth/user";
	import { notifyError } from "$lib/notifications/notificationEvents";
	import { createLatestRequestTracker, createQueryDebouncer } from "$lib/utils/archiveRequests";
	import { getServerFilterOptions, getServers } from "$lib/utils/gameServersApi";
	import {
		SERVER_FILTER_CHIPS,
		countAdvancedServerFilters,
		createDefaultServerFilters,
		createServerQuery,
		resolveServerPageAfterMutation,
		selectedServerChipIds,
		toggleServerFilter,
		type ServerFilterState,
	} from "$lib/utils/serverArchive";
	import EmptyState from "$lib/components/ui/EmptyState.svelte";
	import FilterChipRow from "$lib/components/ui/FilterChipRow.svelte";
	import IconButton from "$lib/components/ui/IconButton.svelte";
	import PaginationControls from "$lib/components/ui/PaginationControls.svelte";
	import SearchField from "$lib/components/ui/SearchField.svelte";
	import AdvancedServerFilters from "./AdvancedServerFilters.svelte";
	import ServerListRow from "./ServerListRow.svelte";

	export let hidden = false;
	export let active = true;
	export let refreshRevision = 0;
	export let busy = false;
	export let requestedYoursRequestId: number | null = null
	export let onRequestedYoursHandled: (requestId: number) => void = () => {}
	export let onEdit: (server: GameServerRecord) => void;
	export let onDelete: (server: GameServerRecord) => void;
	export let onRestore: (server: GameServerRecord) => void;
	export let onResult: (result: { meta: GameServerListMeta; loading: boolean; refreshedAt: string | null }) => void = () => {};

	let page = 1;
	let searchInput = "";
	let search = "";
	let filters = createDefaultServerFilters();
	let queryFilters = createDefaultServerFilters();
	let advancedFiltersOpen = false;
	let servers: GameServerRecord[] = [];
	let meta = emptyMeta(1);
	let loading = false;
	let error: string | null = null;
	let refreshedAt: string | null = null;
	let regions: string[] = [];
	let gameModes: string[] = [];
	let filterOptionsLoaded = false;
	let filterOptionsAttempted = false;
	let lastRequestKey = "";
	let lastResultKey = "";
	let handledYoursRequestId: number | null = null
	const debouncer = createQueryDebouncer<{ search: string; filters: ServerFilterState }>(({ search: nextSearch, filters: nextFilters }) => {
		page = 1;
		search = nextSearch;
		queryFilters = nextFilters;
	});
	const requests = createLatestRequestTracker(() => {});

	$: query = createServerQuery({ page, search, filters: queryFilters });
	$: requestKey = `${refreshRevision}:${JSON.stringify(query)}`;
	$: selected = selectedServerChipIds(filters);
	$: advancedCount = countAdvancedServerFilters(filters);
	$: if (requestedYoursRequestId !== null && requestedYoursRequestId !== handledYoursRequestId) {
		handledYoursRequestId = requestedYoursRequestId
		debouncer.cancel()
		page = 1
		filters = { ...filters, yours: true }
		queryFilters = { ...filters }
		onRequestedYoursHandled(requestedYoursRequestId)
	}
	$: if (active && requestKey !== lastRequestKey) {
		lastRequestKey = requestKey;
		void load(query);
	} else if (!active) {
		lastRequestKey = "";
		requests.cancel();
	}
	$: if (active && !filterOptionsLoaded && !filterOptionsAttempted) {
		filterOptionsAttempted = true;
		void loadFilterOptions();
	} else if (!active) {
		filterOptionsAttempted = false;
	}
	$: {
		const resultKey = JSON.stringify({ meta, loading, refreshedAt });
		if (resultKey !== lastResultKey) {
			lastResultKey = resultKey;
			onResult({ meta, loading, refreshedAt });
		}
	}

	onDestroy(() => { debouncer.cancel(); requests.cancel(); });

	async function load(currentQuery: typeof query): Promise<void> {
		const version = requests.start();
		loading = true;
		error = null;
		try {
			const result = await getServers(currentQuery);
			if (!requests.isCurrent(version)) return;
			if (result.servers.length === 0 && currentQuery.page && currentQuery.page > 1) {
				page = resolveServerPageAfterMutation(currentQuery.page, 0);
				return;
			}
			servers = result.servers;
			meta = result.meta;
			refreshedAt = new Date().toISOString();
		} catch (reason) {
			if (!requests.isCurrent(version)) return;
			error = reason instanceof Error ? reason.message : "Server request failed.";
			notifyError(error, { dedupeKey: "servers:list" });
		} finally {
			requests.settle(version);
			if (requests.isCurrent(version)) loading = false;
		}
	}

	async function loadFilterOptions(): Promise<void> {
		try {
			const options = await getServerFilterOptions();
			regions = options.regions;
			gameModes = options.gameModes;
			filterOptionsLoaded = true;
		} catch (reason) {
			notifyError(reason instanceof Error ? reason.message : `Server filter options failed.`, { dedupeKey: `servers:filter-options` });
		}
	}

	function handleSearch(): void { debouncer.schedule({ search: searchInput, filters }); }
	function handleFilters(next: ServerFilterState): void {
		filters = next;
		debouncer.schedule({ search: searchInput, filters: next });
	}
	function handleChip(id: string): void {
		filters = toggleServerFilter(filters, id);
		queryFilters = { ...filters };
		page = 1;
	}
	function reset(): void {
		debouncer.cancel();
		page = 1;
		searchInput = "";
		search = "";
		filters = createDefaultServerFilters();
		queryFilters = createDefaultServerFilters();
	}
	function emptyMeta(currentPage: number): GameServerListMeta {
		return { currentPage, pageSize: 100, totalPages: 0, totalResults: 0, hasPrevious: currentPage > 1, hasNext: false };
	}
</script>

<div class="server-archive" {hidden}>
	<div class="server-archive__filters">
		<SearchField bind:value={searchInput} placeholder="Search server name ..." tooltip="Search the actual Torn Banner server name." onInput={handleSearch}>
			<svelte:fragment slot="trailing">
				<IconButton icon="fa-sliders" size="md" shape="rounded" position="absolute" ariaLabel={`Advanced filters${advancedCount ? ` (${advancedCount} active)` : ``}`} expanded={advancedFiltersOpen} controls="advanced-server-filters" badge={advancedCount || null} active={advancedFiltersOpen || advancedCount > 0} onClick={() => (advancedFiltersOpen = !advancedFiltersOpen)} />
			</svelte:fragment>
		</SearchField>
		{#if advancedFiltersOpen}<AdvancedServerFilters {filters} {regions} {gameModes} isSuperadmin={Boolean($authState.user?.isSuperadmin)} onChange={handleFilters} />{/if}
		<FilterChipRow chips={SERVER_FILTER_CHIPS} {selected} onToggle={handleChip} onReset={reset} resetTooltip="Clear search and all server filters." />
	</div>

	<div class="server-archive__body" aria-busy={loading}>
		{#each servers as server (server.id)}
			<ServerListRow {server} {busy} {onEdit} {onDelete} {onRestore} />
		{:else}
			{#if !loading}<EmptyState title={error ? "Server archive unavailable" : "No servers"} message={error ?? "No servers match the current search and filters."} />{/if}
		{/each}
	</div>
	<div class="server-archive__pagination">
		<PaginationControls currentPage={meta.currentPage} totalPages={meta.totalPages} hasPrevious={meta.hasPrevious} hasNext={meta.hasNext} disabled={loading} onPrevious={() => (page = Math.max(1, page - 1))} onNext={() => (page += 1)} />
	</div>
</div>

<style lang="scss">
	.server-archive { min-height: 0; display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: var(--gutter-lg); }
	.server-archive__filters { display: grid; margin: 0 var(--gutter-lg); gap: var(--gutter); }
	.server-archive__body { min-height: 0; display: grid; align-content: start; overflow: hidden auto; gap: var(--gutter-md); padding: 0 var(--gutter-lg); }
	.server-archive__pagination { padding: 0 var(--gutter-lg) var(--gutter-lg); }
</style>
