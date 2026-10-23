<script lang="ts">
  import DashboardStatCard from '$lib/components/dashboard/dashboardStatCard.svelte'
  import ListRow from '$lib/components/ui/ListRow.svelte'
  import Tag from '$lib/components/ui/Tag.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import type { TelemetrySnapshot } from '../session/telemetryModels'
  import { playerLabel } from '../preview/telemetrySelectors'
  import { formatRecordTime } from '../timeline/timelineController'
  import MetricHistory from './metricHistory.svelte'
  import ItemLabel from '../items/itemLabel.svelte'
  import { playerObservationLabel } from '../players/playerPresentation'

  let { snapshot, selectedPlayerId, onSelectPlayer }: {
    snapshot: TelemetrySnapshot, selectedPlayerId: string | null, onSelectPlayer: (id: string) => void
  } = $props()
  const player = $derived(snapshot.players.find(player => player.id === selectedPlayerId))
  const totals = $derived(snapshot.totals ?? {
    players: snapshot.players.length,
    present: snapshot.players.filter(player => player.present).length,
    damage: snapshot.players.reduce((sum, player) => sum + (player.damageDealt ?? 0), 0),
    deaths: snapshot.players.reduce((sum, player) => sum + (player.deathCount ?? 0), 0),
    items: snapshot.events.filter(event => [`itemObserved`, `itemDestroyed`, `inventoryChanged`].includes(event.kind)).reduce((sum, event) => sum + event.count, 0),
  })
  const formatValue = (value: number | null) => value === null ? `—` : value.toLocaleString(`en-US`, { maximumFractionDigits: 1 })
  const observationLabel = (value: number | null) => value === null ? `Not observed` : `Last known value`
</script>

<div class="overview">
  {#if selectedPlayerId && !player}
    <EmptyState title="Player not observed yet" message="Move forward in the recording to see this player's observations." />
  {:else if player}
    {#if player.observationKind === `account`}
      <p class="empty">Account observed; no pawn has been linked at this time. An open account context does not establish current server presence.</p>
    {/if}
    <div class="metrics">
      <DashboardStatCard label="Health" value={formatValue(player.health)} caption={`${observationLabel(player.health)}${player.maxHealth === null ? `` : ` · max ${formatValue(player.maxHealth)}`}`} icon="fa-heart" tone="danger" variant="impact" />
      <DashboardStatCard label="Stamina" value={formatValue(player.stamina)} caption={observationLabel(player.stamina)} icon="fa-bolt" tone="blue" variant="impact" />
      <DashboardStatCard label="Damage dealt" value={formatValue(player.damageDealt)} caption={`${formatValue(player.damageTaken)} damage taken`} icon="fa-swords" variant="impact" />
      <DashboardStatCard label="Deaths" value={formatValue(player.deathCount)} caption="Observed in this session" icon="fa-skull" variant="impact" />
    </div>
    {#if player.observationKind !== `account`}<section class="card history-card" aria-label="Health and stamina history">
      <header><h2>Health & stamina</h2><small>Recorded observations · gaps preserved</small></header>
      <div class="histories">
        <MetricHistory label="Health" samples={player.healthHistory} timeMs={snapshot.timeMs} maximum={player.maxHealth ?? 150} color="var(--color-accent-quaternary)" />
        <MetricHistory label="Stamina" samples={player.staminaHistory} timeMs={snapshot.timeMs} color="var(--color-chart-2)" />
      </div>
    </section>{/if}
    <section class="card details-card" aria-label="Player state">
      <div>
        <header><h2>{player.observationKind === `account` ? `Account state` : `Position & state`}</h2><small>Last observed {formatRecordTime(player.lastSeenMs * 1000)}</small></header>
        <dl class="position">
          <div><dt>X</dt><dd>{formatValue(player.position?.x ?? null)}</dd></div>
          <div><dt>Y</dt><dd>{formatValue(player.position?.y ?? null)}</dd></div>
          <div><dt>Z</dt><dd>{formatValue(player.position?.z ?? null)}</dd></div>
          <div><dt>Speed</dt><dd>{formatValue(player.speed)}</dd></div>
          <div><dt>Combat state</dt><dd>{formatValue(player.combatState ?? null)}</dd></div>
          <div><dt>Attack index</dt><dd>{formatValue(player.attackIndex ?? null)}</dd></div>
          <div><dt>Score</dt><dd>{formatValue(player.score ?? null)}</dd></div>
        </dl>
        <div class="statuses">
          <Tag label={playerObservationLabel(player)} compact />
          {#each player.statuses as status}<Tag label={status} compact />{/each}
        </div>
        {#if player.profile && Object.keys(player.profile).length}
          <details class="profile-fields">
            <summary>Recorded profile fields</summary>
            <dl class="inventory">
              {#each Object.entries(player.profile) as [name, value]}
                <div><dt>{name}</dt><dd>{value === null ? `—` : typeof value === `object` ? JSON.stringify(value) : `${value}`}</dd></div>
              {/each}
            </dl>
          </details>
        {/if}
        {#if player.detailTruncated}<p class="empty">Some recorded fields are omitted from this view.</p>{/if}
      </div>
      <div>
        <header><h2>Inventory</h2><small>Last known slots</small></header>
        {#if player.inventory.length}
          <dl class="inventory">
            {#each player.inventory as slot}<div><dt>{slot.slot}</dt><dd><ItemLabel value={slot.item} /></dd></div>{/each}
          </dl>
        {:else}<p class="empty">{player.inventoryKnown === false ? `Inventory has not been observed at this time.` : `No inventory slots at this time.`}</p>{/if}
      </div>
    </section>
  {:else}
    <div class="metrics">
      <DashboardStatCard label="Observed tracks" value={totals.players} caption={`From server · ${totals.present} active`} icon="fa-users" variant="impact" />
      <DashboardStatCard label="Damage dealt" value={formatValue(totals.damage)} caption="Across observed players" icon="fa-swords" variant="impact" />
      <DashboardStatCard label="Deaths" value={formatValue(totals.deaths)} caption="Observed deaths" icon="fa-skull" tone="danger" variant="impact" />
      <DashboardStatCard label="Item activity" value={formatValue(totals.items)} caption="Observations & changes" icon="fa-box-open" tone="blue" variant="impact" />
    </div>
    <section class="card players-card" aria-label="Player overview">
      <header><h2>Recorded tracks</h2><small>Select a player to inspect their history</small></header>
      {#if snapshot.players.length}
        <div class="player-columns" aria-hidden="true"><span>Player</span><span>Health</span><span>Stamina</span><span>Damage</span><span>Deaths</span></div>
        <div class="players">
          {#each snapshot.players as row (row.id)}
            <ListRow title={playerLabel(row)} subtitle={row.observationKind === `account` || row.direction === `toServer` ? playerObservationLabel(row) : row.present ? null : `Last seen ${formatRecordTime(row.lastSeenMs * 1000)}`} variant="compact" onClick={() => onSelectPlayer(row.id)}>
              <span slot="leading" class:present={row.present} class="presence" aria-label={playerObservationLabel(row)}></span>
              <span slot="trailing" class="player-values">
                <span aria-label="Health"><small class="metric-label">Health</small>{formatValue(row.health)}</span>
                <span aria-label="Stamina"><small class="metric-label">Stamina</small>{formatValue(row.stamina)}</span>
                <span aria-label="Damage dealt"><small class="metric-label">Damage</small>{formatValue(row.damageDealt)}</span>
                <span aria-label="Deaths"><small class="metric-label">Deaths</small>{formatValue(row.deathCount)}</span>
              </span>
            </ListRow>
          {/each}
        </div>
      {:else}<EmptyState title="No players observed" message="Player state will appear as observations enter the session." />{/if}
    </section>
  {/if}
</div>

<style lang="scss">
  .profile-fields { margin-top: 12px; color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  .profile-fields summary { cursor: pointer; margin-bottom: 8px; }
  .overview { min-width: 0; display: grid; gap: 12px; }
  .metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .card { min-width: 0; padding: 14px 16px; border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); background: rgbaa(var(--color-dark-primary), .34); }
  header { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 5px 12px; margin-bottom: 12px; }
  h2 { margin: 0; font-size: var(--font-size-label); font-weight: var(--font-weight-bold); }
  small, dt, .empty { color: var(--color-light-tertiary); font-size: var(--font-size-caption); }
  .histories, .details-card { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
  .details-card > div { min-width: 0; }
  dl { margin: 0; }
  dd { margin: 0; font-size: var(--font-size-xs); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
  .position { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
  .position > div { display: grid; gap: 6px; }
  .statuses { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 14px; }
  .inventory { display: grid; gap: 9px; }
  .inventory > div { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 10px; }
  .players { display: grid; gap: 3px; }
  .player-columns { display: grid; grid-template-columns: minmax(0, 1fr) repeat(4, 68px); gap: 10px; padding: 0 8px 9px; font-size: var(--font-size-caption); color: var(--color-light-tertiary); }
  .player-columns span:not(:first-child), .player-values span { text-align: right; }
  .player-values { display: grid; grid-template-columns: repeat(4, 68px); gap: 10px; font-size: var(--font-size-xs); font-variant-numeric: tabular-nums; }
  .metric-label { display: none; }
  .presence { width: 6px; height: 6px; border-radius: 50%; background: var(--color-dark-tertiary); }
  .presence.present { background: var(--color-accent-primary); }
  @container telemetry (max-width: 759px) {
    .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .histories, .details-card { grid-template-columns: minmax(0, 1fr); }
    .player-columns { grid-template-columns: minmax(0, 1fr) repeat(4, 48px); }
    .player-values { grid-template-columns: repeat(4, 48px); }
  }
  @container telemetry (max-width: 479px) {
    .metrics { grid-template-columns: minmax(0, 1fr); }
    .card { padding: 12px; }
    .position { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .player-columns { display: none; }
    .players :global(.list-row) { display: grid; grid-template-columns: 6px minmax(0, 1fr); gap: 8px; padding: 8px; }
    .players :global(.list-row__trailing) { grid-column: 2; display: block; min-width: 0; }
    .player-values { width: 100%; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 16px; }
    .player-values > span { display: flex; justify-content: space-between; gap: 6px; }
    .metric-label { display: inline; }
  }
</style>
