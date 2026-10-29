<script lang="ts">
  import { onDestroy } from 'svelte'
  import { authState } from '$lib/auth/user'
  import { getServerApi, type DbPlayerListItem } from '$lib/core'
  import { unwrap } from '$lib/utils/apiResult'
  import { extractDbPlayers } from '$lib/utils/dbPlayers'
  import { hasKnownPlayfabId } from '@spellbook/shared/playerIdentity'
  import { playerSearchMinimumLength } from '@spellbook/shared/playerListQuery'
  import { createQueryDebouncer } from '$lib/utils/archiveRequests'
  import Input from '$lib/components/ui/Input.svelte'
  import Select from '$lib/components/ui/Select.svelte'
  import Button from '$lib/components/ui/Button.svelte'
  import InfoNotice from '$lib/components/ui/infoNotice.svelte'
  import { canOpenPlayerForensics } from './forensicsAccess'
  import { createForensicsController, initialForensicsState } from './forensicsController'
  import { normalizeForensicsTab } from './forensicsTabs'
  import { createTriangulationMap, createServerLocationPopup } from './triangulationMap'
  import GeoMap from '$lib/components/ui/maps/geoMap.svelte'
  import { openStreetMapTiles } from '$lib/maps/mapTiles'
  import PanelHeader from '$lib/components/ui/PanelHeader.svelte'
  import Tabs from '$lib/components/ui/tabs.svelte'
  import Wip from '$lib/components/ui/wip.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import StatChip from '$lib/components/ui/StatChip.svelte'
  import DateStamp from '$lib/components/ui/dateStamp.svelte'
  import DashboardStatCard from '$lib/components/dashboard/dashboardStatCard.svelte'
  import { navigation, rememberNavigation } from '$lib/navigation/navigation'

  let state = initialForensicsState()
  let query = ``
  let results: DbPlayerListItem[] = []
  let searching = false
  let searchError: string | null = null
  let selectedPlayer: DbPlayerListItem | null = null
  let sessionStamp = ``
  let searchGeneration = 0
  let disposed = false
  let selectedMarkerId: string | null = null
  const estimateCaptions: Record<string, string> = {
    noUsablePings: `Not enough pings`, insufficientLocations: `Not enough locations`, inconsistentReadings: `Conflicting readings`,
    unresolved: `Unresolved`, tooBroad: `Too broad`, budgetExceeded: `Too much data`
  }
  const estimateMessages: Record<string, string> = {
    noUsablePings: `More ping readings are needed to estimate a player radius.`,
    insufficientLocations: `Not enough server locations to estimate a player radius.`,
    inconsistentReadings: `A player radius could not be calculated. These readings do not agree on one location.`,
    unresolved: `These readings do not give a clear player radius.`,
    tooBroad: `The possible area is too large to show a useful player radius.`,
    budgetExceeded: `There is too much data to estimate a radius for this player.`
  }
  const controller = createForensicsController({ ping: id => getServerApi().forensics.alt.ping(id),
    triangulate: id => getServerApi().forensics.alt.triangulate(id) }, next => { if (state.playerId !== next.playerId) selectedMarkerId = null; state = next })
  const searchDebouncer = createQueryDebouncer<string>(value => void search(value))

  $: roleAllowed = canOpenPlayerForensics($authState.user)
  $: allowed = roleAllowed && !state.accessDenied
  $: {
    const nextStamp = `${$authState.user?.id ?? null}:${roleAllowed}`
    if (nextStamp !== sessionStamp) {
      sessionStamp = nextStamp
      resetSearch()
      controller.setSession($authState.user?.id ?? null, roleAllowed)
    }
  }
  $: if (state.accessDenied) resetSearch()
  $: if (state.playerId === null) selectedPlayer = null
  $: selectablePlayers = selectedPlayer ? [selectedPlayer, ...results.filter(player => player.id !== selectedPlayer?.id)] : results
  $: analysis = state.activeTab === `ping` ? state.ping : state.activeTab === `triangulate` ? state.triangulate : null
  $: mapData = state.triangulate.data ? createTriangulationMap(state.triangulate.data) : null
  $: estimate = state.triangulate.data?.estimate ?? null
  $: estimateCaption = estimate?.status === `regionAvailable` ? `${number(estimate.areaKm2)} km² · Unvalidated` : estimateCaptions[estimate?.status ?? ``] ?? `Not available`
  $: estimateMessage = estimate?.status === `regionAvailable` ? null : estimateMessages[estimate?.status ?? ``] ?? `A player radius is not available for these readings.`

  function resetSearch(): void {
    searchDebouncer.cancel()
    searchGeneration++
    query = ``
    results = []
    selectedPlayer = null
    searching = false
    searchError = null
  }

  function searchChanged(): void {
    searchGeneration++
    results = []
    searching = false
    searchError = null
    searchDebouncer.cancel()
    if ([...query.trim()].length >= playerSearchMinimumLength) {
      searching = true
      searchDebouncer.schedule(query)
    }
  }

  async function search(value: string): Promise<void> {
    if (!allowed || [...value.trim()].length < playerSearchMinimumLength || disposed) return
    const generation = ++searchGeneration
    const session = sessionStamp
    results = []
    searching = true
    searchError = null
    try {
      const data = await unwrap<unknown>(await getServerApi().getPlayers({ search: value.trim() }), `Could not find players. Please try again.`)
      if (disposed || session !== sessionStamp || generation !== searchGeneration || !allowed) return
      results = extractDbPlayers(data).filter(player => hasKnownPlayfabId(player.playfabId)).slice(0, 20)
      if (!results.length) searchError = `No players found. Try another name or PlayFab ID.`
    } catch (error) {
      if (disposed || session !== sessionStamp || generation !== searchGeneration || !allowed) return
      searchError = error instanceof Error ? error.message : `Could not find players. Please try again.`
    } finally {
      if (!disposed && session === sessionStamp && generation === searchGeneration) searching = false
    }
  }

  function select(value: string): void {
    selectedPlayer = selectablePlayers.find(player => player.id === Number(value)) ?? null
    void controller.selectPlayer(selectedPlayer?.id ?? null)
  }

  const number = (value: number | null) => value === null ? `—` : value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  const ms = (value: number | null) => value === null ? `—` : `${number(value)} ms`
  function popupContent(markerId: string): HTMLElement {
    return createServerLocationPopup(mapData?.serversByMarker.get(markerId) ?? [], document)
  }

  onDestroy(() => { disposed = true; searchDebouncer.cancel(); searchGeneration++; controller.dispose(); results = []; selectedPlayer = null })

  const tabs = [
    { value: `ping`, label: `Ping` },
    { value: `triangulate`, label: `Triangulate` },
    { value: `friends`, label: `Friends` },
    { value: `rhythm`, label: `Rhythm` }
  ]
  rememberNavigation(`playerForensicsTab`, () => state.activeTab, value => { void controller.selectTab(value) }, normalizeForensicsTab)
  async function selectTab(value: string): Promise<void> { await navigation.visit(() => { void controller.selectTab(normalizeForensicsTab(value)) }) }
</script>

{#if allowed}
  <section class="player-forensics panel-view" aria-label="Player Forensics">
    <div class="player-forensics__heading">
      <PanelHeader title="Player Forensics" eyebrow="Player data">
        <svelte:fragment slot="trailing">
          <div class="player-forensics__controls" aria-busy={searching || analysis?.status === `loading`}>
            <Input label="Find player" type="search" value={query} placeholder="Find player" maxlength={255} onChange={value => { query = value; searchChanged() }} />
            <Select ariaLabel="Player" value={selectedPlayer ? String(selectedPlayer.id) : ``} options={selectablePlayers.map(player => ({ value: String(player.id), label: `${player.latestName ?? player.playfabId} · ${player.playfabId}` }))} placeholder={searching ? `Searching…` : `Choose player`} onChange={select} disabled={!selectablePlayers.length} />
          </div>
        </svelte:fragment>
      </PanelHeader>
      {#if searchError}<div class="player-forensics__error" role="alert"><InfoNotice message={searchError} icon="fa-triangle-exclamation" tone="var(--color-danger)" /></div>{/if}
    </div>
    <div class="player-forensics__content">
      <Tabs items={tabs} value={state.activeTab} label="Player Forensics" fill onChange={value => void selectTab(value)}>
        {#if analysis?.error}
          <div class="player-forensics__request-error" role="alert">
            <InfoNotice message={analysis.error} icon="fa-triangle-exclamation" tone="var(--color-danger)" />
            <Button label="Retry" size="sm" onClick={() => void controller.selectTab(state.activeTab)} />
          </div>
        {/if}
        {#if state.activeTab === `ping`}
          <div class="player-forensics__body">
            {#if state.ping.data}
              <div class="player-forensics__identity">
                <strong>{selectedPlayer?.latestName ?? selectedPlayer?.playfabId ?? `Player`}</strong>
                <div class="player-forensics__meta">
                  <StatChip label="Readings" value={number(state.ping.data.overall.sampleCount)} icon="fa-signal" tone="accent" />
                  <StatChip label="Servers" value={number(state.ping.data.overall.serverCount)} icon="fa-server" tone="accent" />
                  <StatChip label="Days" value={number(state.ping.data.overall.observedDateCount)} icon="fa-calendar" tone="accent" />
                </div>
                {#if state.ping.data.overall.firstObservedAt && state.ping.data.overall.lastObservedAt}
                  <small><DateStamp value={state.ping.data.overall.firstObservedAt} styled={false} /> — <DateStamp value={state.ping.data.overall.lastObservedAt} styled={false} /></small>
                {/if}
              </div>
              <section class="player-forensics__vector" aria-label="Ping vector">
                <PanelHeader title="Ping" variant="section" />
                {#if state.ping.data.status === `noData`}
                  <EmptyState title="No ping history" message="Try another player or check again later." />
                {:else}
                  <div class="player-forensics__stats">
                    <DashboardStatCard label="Average" value={ms(state.ping.data.overall.meanMs)} icon="fa-signal" />
                    <DashboardStatCard label="Median" value={ms(state.ping.data.overall.medianMs)} icon="fa-wave-pulse" />
                    <DashboardStatCard label="Variation" value={ms(state.ping.data.overall.meanAbsoluteChangeMs)} caption={state.ping.data.overall.variationPercent === null ? `—` : `${number(state.ping.data.overall.variationPercent)}%`} icon="fa-chart-line" />
                    <DashboardStatCard label="Deviation" value={ms(state.ping.data.overall.standardDeviationMs)} />
                    <DashboardStatCard label="P10 – P90" value={`${ms(state.ping.data.overall.p10Ms)} – ${ms(state.ping.data.overall.p90Ms)}`} />
                    <DashboardStatCard label="Pairs" value={number(state.ping.data.overall.variationPairCount)} />
                  </div>
                  <h3>By server</h3>
                  <div class="player-forensics__servers">
                    {#each state.ping.data.servers as server (server.serverId)}
                      <DashboardStatCard label={`${server.serverName ?? `Server ${server.serverId}`}${server.deleted ? ` (removed)` : ``}`} value={ms(server.medianMs)} caption={`Median · ${number(server.sampleCount)} readings`}>
                        <div class="player-forensics__meta">
                          <StatChip label="Average" value={ms(server.meanMs)} tone="accent" />
                          <StatChip label="Variation" value={ms(server.meanAbsoluteChangeMs)} tone="accent" />
                          <StatChip label="Variation %" value={server.variationPercent === null ? `—` : `${number(server.variationPercent)}%`} tone="accent" />
                          <StatChip label="Deviation" value={ms(server.standardDeviationMs)} tone="accent" />
                          <StatChip label="P10 – P90" value={`${ms(server.p10Ms)} – ${ms(server.p90Ms)}`} tone="accent" />
                          <StatChip label="Pairs" value={number(server.variationPairCount)} tone="accent" />
                        </div>
                        <div class="player-forensics__times">
                          {#if server.lastObservedAt}<span>Last <DateStamp value={server.lastObservedAt} format="relative" styled={false} /></span>{/if}
                          {#if server.backendPingContext}<span>SpellBook {ms(server.backendPingContext.pingMs)} · <DateStamp value={server.backendPingContext.observedAt} format="relative" styled={false} /></span>{/if}
                        </div>
                      </DashboardStatCard>
                    {/each}
                  </div>
                {/if}
              </section>
            {:else if state.ping.status === `loading`}
              <p role="status">Loading…</p>
            {:else if state.playerId === null}
              <EmptyState title="Select a player" message="Search by name or PlayFab ID." />
            {/if}
          </div>
        {:else if state.activeTab === `triangulate`}
          <div class="player-forensics__body">
            {#if state.triangulate.data}
              <section class="player-forensics__vector" aria-label="Triangulate">
                <div class="player-forensics__stats player-forensics__stats--map">
                  <DashboardStatCard label="Mapped servers" value={`${number(state.triangulate.data.coverage.mappedServerCount)} / ${number(state.triangulate.data.coverage.serverCount)}`} icon="fa-server" />
                  <DashboardStatCard label="Locations" value={number(state.triangulate.data.coverage.distinctLocationCount)} icon="fa-location-dot" />
                  <DashboardStatCard label="Readings" value={number(state.triangulate.data.coverage.sampleCount)} icon="fa-signal" />
                  <DashboardStatCard label="Player radius" value={estimate?.status === `regionAvailable` && estimate.circle ? `${number(estimate.circle.radiusKm)} km` : `—`} caption={estimateCaption} />
                </div>
                {#if state.triangulate.data.status === `noData`}
                  <EmptyState title="No ping history" message="Try another player or check again later." />
                {:else if state.triangulate.data.coverage.mappedServerCount > 0 && mapData?.markers.length}
                  {#if estimateMessage}<div role="status"><InfoNotice message={estimateMessage} icon="fa-triangle-exclamation" tone={estimate?.status === `inconsistentReadings` ? `var(--color-danger)` : `var(--color-accent-tertiary)`} /></div>{/if}
                  <div class="player-forensics__map-key" aria-label="Map colours">
                    <span class="player-forensics__map-key--servers">Servers</span><span class="player-forensics__map-key--visited">Visited</span><span class="player-forensics__map-key--player">Player radius</span>
                    {#if state.triangulate.data.map?.truncated}<small>Server map limited</small>{/if}
                  </div>
                  <GeoMap datasetKey={`${sessionStamp}:${state.playerId}`} markers={mapData.markers} circles={mapData.circles} region={mapData.region}
                    {selectedMarkerId} tiles={openStreetMapTiles} {popupContent}
                    onSelect={id => { selectedMarkerId = id }} />
                {:else}
                  <EmptyState title="No server locations" message="Try another player." />
                {/if}
              </section>
            {:else if state.triangulate.status === `loading`}
              <p role="status">Loading…</p>
            {:else if state.playerId === null}
              <EmptyState title="Select a player" message="Search by name or PlayFab ID." />
            {/if}
          </div>
        {:else}
          <Wip />
        {/if}
      </Tabs>
    </div>
  </section>
{:else}
  <Wip />
{/if}

<style>
  .player-forensics { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: var(--gutter-lg); min-height: 0; height: 100%; padding-top: var(--gutter-lg) }
  .player-forensics__content { min-height: 0; overflow: auto; padding: 0 var(--gutter-lg) var(--gutter-lg); container-type: inline-size }
  .player-forensics__body, .player-forensics__vector, .player-forensics__servers { display: grid; gap: var(--gutter-md); min-width: 0 }
  .player-forensics__body { padding-top: var(--gutter-md) }
  .player-forensics__heading :global(.panel-header--panel) { align-items: center; justify-content: space-between; flex-wrap: wrap; gap: var(--gutter-sm) var(--gutter-md) }
  .player-forensics__heading :global(.panel-header--panel > .panel-header__identity) { flex: 0 1 auto }
  .player-forensics__heading :global(.panel-header--panel > .panel-header__trailing) { flex: 1 1 300px; max-width: 488px; min-width: 0 }
  .player-forensics__controls { display: grid; grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr); align-items: center; gap: var(--gutter-sm); width: 100%; --control-height-md: var(--control-height-sm) }
  .player-forensics__controls :global(.ui-input > label) { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%) }
  .player-forensics__controls :global(.ui-select__control > span) { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .player-forensics__error { margin: var(--gutter-sm) var(--gutter-lg) 0 }
  .player-forensics__request-error { display: flex; align-items: center; gap: var(--gutter-sm); padding-top: var(--gutter-md) }
  .player-forensics__identity { display: grid; gap: var(--gutter-sm); padding: var(--gutter-md) 0 }
  .player-forensics__meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--gutter-sm) var(--gutter-md) }
  .player-forensics__stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--gutter-sm) }
  .player-forensics__stats--map { grid-template-columns: repeat(4, minmax(0, 1fr)) }
  .player-forensics__map-key { display: flex; flex-wrap: wrap; gap: var(--gutter-md); color: var(--color-light-secondary); font-size: var(--font-size-xs) }
  .player-forensics__map-key span::before { content: ''; display: inline-block; width: 8px; height: 8px; margin-right: 6px; border-radius: 50%; background: var(--map-key-color) }
  .player-forensics__map-key--servers { --map-key-color: #8b97a3 }
  .player-forensics__map-key--visited { --map-key-color: #a35cff }
  .player-forensics__map-key--player { --map-key-color: #32f59b }
  .player-forensics__times { display: flex; flex-wrap: wrap; gap: var(--gutter-sm) var(--gutter-md); padding-top: var(--gutter-sm); color: var(--color-light-tertiary); font-size: var(--font-size-caption) }
  small { color: var(--color-light-tertiary); font-size: var(--font-size-caption) }
  h3, p { margin: 0 }
  h3 { color: var(--color-light-secondary); font-size: var(--font-size-sm); font-weight: var(--font-weight-medium) }
  @container (max-width: 400px) {
    .player-forensics__stats { grid-template-columns: repeat(2, minmax(0, 1fr)) }
    .player-forensics__content :global(.tabs__list) { flex-wrap: wrap }
    .player-forensics__content :global(.tabs__list > button) { flex-basis: 45% }
  }
</style>
