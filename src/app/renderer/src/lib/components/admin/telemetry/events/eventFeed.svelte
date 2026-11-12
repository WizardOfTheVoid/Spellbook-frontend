<script lang="ts">
  import DashboardStatCard from '$lib/components/dashboard/dashboardStatCard.svelte'
  import Button from '$lib/components/ui/Button.svelte'
  import Input from '$lib/components/ui/Input.svelte'
  import Select from '$lib/components/ui/Select.svelte'
  import ListRow from '$lib/components/ui/ListRow.svelte'
  import Tag from '$lib/components/ui/Tag.svelte'
  import EmptyState from '$lib/components/ui/EmptyState.svelte'
  import PaginationControls from '$lib/components/ui/PaginationControls.svelte'
  import ItemLabel from '../items/itemLabel.svelte'
  import { itemPresentation } from '../items/itemPresentation'
  import type { TelemetryEvent, TelemetryEventKind, TelemetrySnapshot } from '../session/telemetryModels'
  import { selectEvents, playerLabel } from '../preview/telemetrySelectors'
  import { formatRecordTime } from '../timeline/timelineController'
  import { eventKindLabels, eventParticipants, eventTabKinds, filterEventFeed, sumEventAmount, type EventFeedFilter, type EventFeedTab } from './eventFeedFilters'

  let { snapshot, selectedPlayerId, tab, onSeek, onSelectPlayer, filter, onFilter, onPage }: {
    snapshot: TelemetrySnapshot, selectedPlayerId: string | null, tab: EventFeedTab,
    onSeek: (timeMs: number) => void, onSelectPlayer: (id: string) => void,
    filter: EventFeedFilter, onFilter: (tab: EventFeedTab, filter: EventFeedFilter) => void,
    onPage: (tab: EventFeedTab, page: number) => void
  } = $props()
  const scoped = $derived(snapshot.eventPage ? snapshot.events : selectEvents(snapshot, selectedPlayerId, tab))
  const filtered = $derived(snapshot.eventPage ? scoped : filterEventFeed(scoped, snapshot, filter))
  const total = $derived(snapshot.eventPage?.total ?? filtered.length)
  const options = $derived([{ value: ``, label: `All types` }, ...eventTabKinds[tab].map(kind => ({ value: kind, label: eventKindLabels[kind] }))])
  const title = $derived(tab === `kills` ? `Deaths & disconnects` : tab === `combat` ? `Combat activity` : `Item activity`)
  const count = (kind: TelemetryEventKind) => snapshot.eventPage ? snapshot.eventPage.counts[kind] ?? `—` : scoped.filter(event => event.kind === kind).reduce((sum, event) => sum + event.count, 0)
  const amount = (kind: TelemetryEventKind) => (snapshot.eventPage ? snapshot.eventPage.amounts[kind] : sumEventAmount(scoped, kind)) ?? `—`
  const labelFor = (id: string) => {
    const player = snapshot.players.find(player => player.id === id || player.aliases?.includes(id))
    return player ? playerLabel(player) : id
  }
  const eventTitle = (event: TelemetryEvent) => {
    const title = eventKindLabels[event.kind]
    if (event.itemClass) return itemPresentation(event.itemClass).label
    if (event.kind === `damage` || event.kind === `heal`) return `${title} · ${event.amount === null ? `—` : event.amount.toLocaleString(`en-US`)}`
    return title
  }
  const icons: Record<EventFeedTab, string> = { kills: `fa-skull`, combat: `fa-swords`, items: `fa-box-open` }
</script>

<div class="event-view">
  <div class="metrics" class:two-metrics={tab === `kills`}>
    {#if tab === `kills`}
      <DashboardStatCard label="Deaths" value={count(`death`)} caption="Observed deaths" icon="fa-skull" tone="danger" variant="impact" />
      <DashboardStatCard label="Disconnects" value={count(`disconnect`)} caption="Player departures" icon="fa-arrow-right-from-bracket" variant="impact" />
    {:else if tab === `combat`}
      <DashboardStatCard label="Damage" value={amount(`damage`)} caption={`${count(`damage`)} observations`} icon="fa-swords" tone="danger" variant="impact" />
      <DashboardStatCard label="Healing" value={amount(`heal`)} caption={`${count(`heal`)} observations`} icon="fa-heart" variant="impact" />
      <DashboardStatCard label="Attack requests" value={count(`attackStart`)} caption={`${count(`attackCancel`)} cancellations`} icon="fa-bolt" tone="blue" variant="impact" />
    {:else}
      <DashboardStatCard label="Observed" value={count(`itemObserved`)} caption="Item observations" icon="fa-eye" variant="impact" />
      <DashboardStatCard label="Destroyed" value={count(`itemDestroyed`)} caption="Observed destruction" icon="fa-box-open" variant="impact" />
      <DashboardStatCard label="Inventory changes" value={count(`inventoryChanged`)} caption="Recorded slot changes" icon="fa-backpack" tone="blue" variant="impact" />
    {/if}
  </div>
  <section class="feed-card" aria-label={title}>
    <header><div><h2>{title}</h2><small>{selectedPlayerId ? `Events involving ${labelFor(selectedPlayerId)}` : `All observed players`}</small></div><span class="result-count">{total} {total === 1 ? `entry` : `entries`}</span></header>
    <div class="filters">
      <Input label="Search events" type="search" maxlength={128} placeholder={tab === `items` ? `Item class or reference…` : `Event or reference…`} value={filter.query} onChange={value => onFilter(tab, { ...filter, query: value })} />
      <Select label="Event type" value={filter.kind} {options} onChange={value => onFilter(tab, { ...filter, kind: value })} />
    </div>
    {#if filtered.length}
      <div class="events">
        {#each filtered as event (event.id)}
          <div class="event" class:death={event.kind === `death`} class:disconnect={event.kind === `disconnect`}>
            <ListRow title={eventTitle(event)} variant="compact">
              <span slot="title">{#if event.itemClass}<ItemLabel value={event.itemClass} />{:else}{eventTitle(event)}{/if}</span>
              <span slot="leading" class="event-time"><Button label={formatRecordTime(event.timeMs * 1000)} size="sm" tooltip="Pause and seek to this observation" onClick={() => onSeek(event.timeMs)} /></span>
              <span slot="titleTrailing" class="event-kind">
                {#if tab === `items`}<Tag label={eventKindLabels[event.kind]} count={event.count} compact />{/if}
              </span>
              <span slot="meta" class="participants">
                {#each eventParticipants(event) as participant (participant.id)}
                  <span class="participant"><small>{participant.role}</small><Tag label={labelFor(participant.id)} selected={selectedPlayerId === participant.id} compact onClick={() => onSelectPlayer(participant.id)} /></span>
                {/each}
                {#if !event.actorId && !event.targetId && !event.contributorIds.length}<small>Unattributed</small>{/if}
              </span>
              <i slot="trailing" class={`fa-light ${event.kind === `disconnect` ? `fa-arrow-right-from-bracket` : icons[tab]}`} aria-hidden="true"></i>
            </ListRow>
            <details>
              <summary>Details</summary>
              <p>{event.detail}</p>
              {#if event.detailTruncated}<p>Some recorded fields are omitted from this view.</p>{/if}
              <dl>
                <div><dt>Event reference</dt><dd>{event.id}</dd></div>
                {#if event.itemClass}<div><dt>Item class</dt><dd>{event.itemClass}</dd></div>{/if}
                {#if event.relationship}<div><dt>Relationship</dt><dd>{event.relationship}</dd></div>{/if}
                {#if event.actorId}<div><dt>Source reference</dt><dd>{event.actorId}</dd></div>{/if}
                {#if event.targetId}<div><dt>Target reference</dt><dd>{event.targetId}</dd></div>{/if}
                {#if event.contributorIds.length}<div><dt>Contributor references</dt><dd>{event.contributorIds.join(`, `)}</dd></div>{/if}
                {#if typeof event.reasonCode === `number`}<div><dt>Observed reason code</dt><dd>{event.reasonCode}</dd></div>{/if}
                {#if event.values}
                  {#each Object.entries(event.values) as [name, value]}
                    <div><dt>{name}</dt><dd>{value === null ? `—` : typeof value === `object` ? JSON.stringify(value) : `${value}`}</dd></div>
                  {/each}
                {/if}
              </dl>
            </details>
          </div>
        {/each}
      </div>
    {:else}
      <EmptyState title={scoped.length ? `No matching events` : `No events at this time`} message={scoped.length ? `Try another search or event type.` : `Move through the session to see recorded activity.`} />
    {/if}
    {#if snapshot.eventPage}
      <PaginationControls currentPage={snapshot.eventPage.page} totalPages={null}
        hasPrevious={snapshot.eventPage.page > 1} hasNext={snapshot.eventPage.hasNext}
        onPrevious={() => onPage(tab, snapshot.eventPage!.page - 1)} onNext={() => onPage(tab, snapshot.eventPage!.page + 1)} />
    {/if}
  </section>
</div>

<style lang="scss">
  .event-view { min-width: 0; display: grid; gap: 12px; }
  .metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
  .two-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .feed-card { min-width: 0; padding: 14px 16px; border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); background: rgbaa(var(--color-dark-primary), .34); }
  header { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 14px; }
  header > div { display: grid; gap: 4px; min-width: 0; }
  h2 { margin: 0; font-size: var(--font-size-label); font-weight: var(--font-weight-bold); }
  small, .result-count { color: var(--color-light-tertiary); font-size: var(--font-size-caption); }
  .result-count { flex: 0 0 auto; }
  .filters { display: grid; grid-template-columns: minmax(0, 1fr) 180px; gap: 12px; margin-bottom: 16px; }
  .events { display: grid; gap: 7px; }
  .event { min-width: 0; padding: 5px 2px; border: 1px solid var(--color-dark-secondary); border-radius: var(--radius); }
  .event.death { border-left: 2px solid var(--color-accent-quaternary); }
  .event.disconnect { border-left: 2px solid var(--color-light-tertiary); }
  .event-time { font-variant-numeric: tabular-nums; }
  .event-time :global(.ui-button) { padding: 0 4px; font-size: var(--font-size-caption); color: var(--color-accent-tertiary); }
  .participants, .participant { display: flex; align-items: center; flex-wrap: wrap; gap: 5px; }
  .participant { min-width: 0; max-width: 100%; }
  .participant :global(.ui-tag) { min-width: 0; max-width: 100%; }
  .participant :global(.ui-tag__label) { overflow: hidden; text-overflow: ellipsis; }
  .participants { gap: 6px 12px; margin: 5px 0 3px; }
  .event-kind { display: inline-flex; }
  i { color: var(--color-light-tertiary); }
  details { margin: 3px 12px 2px; font-size: var(--font-size-caption); color: var(--color-light-tertiary); }
  summary { width: fit-content; padding: 3px 0; cursor: pointer; }
  summary:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 3px; }
  p { color: var(--color-light-secondary); margin: 9px 0; line-height: 1.5; }
  dl { display: grid; gap: 6px; margin: 0 0 8px; }
  dl > div { display: grid; grid-template-columns: 140px minmax(0, 1fr); gap: 12px; }
  dd { margin: 0; overflow-wrap: anywhere; color: var(--color-light-secondary); }
  @container telemetry (max-width: 759px) {
    .metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .filters { grid-template-columns: minmax(0, 1fr); }
    dl > div { grid-template-columns: minmax(0, 1fr); gap: 3px; }
  }
  @container telemetry (max-width: 479px) {
    .metrics { grid-template-columns: minmax(0, 1fr); }
    .feed-card { padding: 12px; }
    header { flex-wrap: wrap; }
    .event :global(.list-row) { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 6px; }
    .event :global(.list-row__main) { grid-column: 1 / -1; grid-row: 2; }
    .event :global(.list-row__trailing) { grid-column: 2; grid-row: 1; }
    .event :global(.list-row__title) { flex-wrap: wrap; }
  }
</style>
