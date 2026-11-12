<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte'
  import PanelHeader from '../ui/PanelHeader.svelte'
  import Icon from '../ui/Icon.svelte'
  import Button from '../ui/Button.svelte'
  import EmptyState from '../ui/EmptyState.svelte'
  import { closeInfinityMenu, infinityMenuState } from '../ui/infinityMenu'
  import { playCustomSFX, stopCustomSFX } from '$lib/global/sfx'
  import { navigation, rememberNavigation } from '$lib/navigation/navigation'
  import { authState } from '$lib/auth/user'
  import type { PlayerState } from '$lib/types/playerState'
  import ActionEventsFilters from './actionEventsFilters.svelte'
  import ActionEventRow from './actionEventRow.svelte'
  import ActionEventsVirtualList from './actionEventsVirtualList.svelte'
  import { ActionEventsFeed } from './actionEventsFeed'
  import { ActionEventsHistory } from './actionEventsHistory'
  import { actionEventsPendingCount } from './actionEventsPendingCount'
  import { canFollowActionEvents, setActionEventsTeams } from './actionEventsQuery'
  import { createActionEventsApiSource } from './actionEventsApiSource'
  import { actionsApi } from '$lib/utils/actionsApi'
  import type { ActionEvent, ActionEventsCatalog, ActionEventsPlayer, ActionEventsQuery, ActionEventsSession, ActionEventsSource, ActionEventsState } from './actionEventsTypes'

  export let isActive = false
  export let session: ActionEventsSession = { accountId: null }
  export let source: ActionEventsSource | undefined = undefined
  export let onOpenPlayerProfile: (player: PlayerState) => void = () => {}
  export let onOpenServer: (id: number) => void = () => {}

  let body: HTMLDivElement
  let virtualList: ActionEventsVirtualList
  let state: ActionEventsState
  let mounted = false
  let documentVisible = true
  let advancedFiltersOpen = false
  let focusedId: number | null = null
  let atTop = true
  let restoring = Boolean(session.state?.items.length)
  let announcement = ``
  let queuedSounds = 0
  let enteringIds: number[] = []
  let enterFrame: number | undefined
  let settleFrame: number | undefined
  let entryRevision = 0
  let soundTimer: ReturnType<typeof setTimeout> | undefined
  const savedAnchor = session.anchor
  const savedTop = session.scrollTop ?? 0
  let knownTeams = session.catalog?.teams ?? session.source?.catalog.teams ?? []
  const dataSource = source ?? createActionEventsApiSource(actionsApi, catalogChanged)
  let catalog = session.catalog ?? dataSource.catalog
  session.source = dataSource
  const history = session.history ??= new ActionEventsHistory()

  function catalogChanged(next: ActionEventsCatalog): void {
    const teamIds = new Set(next.teams.map(team => team.id))
    const reducedAccess = knownTeams.some(team => !teamIds.has(team.id))
    session.catalog = { ...next }
    knownTeams = next.teams
    const query = feed.state.query
    const teams = query.teams.mode === `selected` ? { ...query.teams, ids: query.teams.ids.filter(id => teamIds.has(id)) } : query.teams
    const constrained = setActionEventsTeams({ ...query, servers: query.servers.filter(id => next.servers.some(server => server.id === id)) }, teams, next)
    if (!reducedAccess && JSON.stringify(constrained) === JSON.stringify(query)) return
    history.clear()
    session.anchor = null
    session.scrollTop = 0
    restoring = false
    void feed.setQuery(constrained)
  }

  function quiet(): void {
    entryRevision++
    queuedSounds = 0
    clearTimeout(soundTimer)
    stopCustomSFX(`notification`)
    if (enterFrame !== undefined) cancelAnimationFrame(enterFrame)
    if (settleFrame !== undefined) cancelAnimationFrame(settleFrame)
    enteringIds = []
  }

  function playNext(): void {
    if (!queuedSounds || !mounted || !isActive || !documentVisible) return
    playCustomSFX(`notification`, 0.18)
    queuedSounds--
    if (queuedSounds) soundTimer = setTimeout(playNext, 270)
  }

  async function animateIncoming(items: ActionEvent[]): Promise<void> {
    const revision = ++entryRevision
    enteringIds = items.map(item => item.id)
    await tick()
    if (revision !== entryRevision || !mounted) return
    enterFrame = requestAnimationFrame(() => {
      settleFrame = requestAnimationFrame(() => { if (revision === entryRevision) enteringIds = [] })
    })
  }

  function inserted(items: ActionEvent[]): void {
    void animateIncoming(items)
    announcement = `${items.length} new action${items.length === 1 ? `` : `s`}`
    const wasEmpty = queuedSounds === 0
    queuedSounds = Math.min(30, queuedSounds + items.length)
    if (wasEmpty) playNext()
  }

  const feed = new ActionEventsFeed(dataSource, {
    state: session.state, onChange: value => {
      state = value
      catalog = { ...(session.catalog ?? dataSource.catalog) }
      session.state = { ...value, loading: null, pendingIds: [] }
    },
    onInsert: inserted, onQuiet: quiet
  })

  $: void feed.setActive(mounted && isActive && documentVisible)
  $: menuId = $infinityMenuState?.owner?.closest<HTMLElement>(`[data-action-event]`)?.dataset.actionEvent
  $: if (!isActive || !documentVisible) advancedFiltersOpen = false
  $: feed.setInteraction(Boolean(menuId) || advancedFiltersOpen)
  $: pinnedIds = [...new Set([...state.pendingIds, ...(focusedId === null ? [] : [focusedId]), ...(menuId ? [Number(menuId)] : [])])]
  $: if (mounted && !state.loading && state.items.length) void checkEndAfterRender()

  onMount(() => {
    mounted = true
    const visibility = () => { documentVisible = !document.hidden }
    visibility()
    document.addEventListener(`visibilitychange`, visibility)
    if (restoring) void restoreScroll(savedAnchor, savedTop)
    return () => { document.removeEventListener(`visibilitychange`, visibility) }
  })

  onDestroy(() => {
    rememberScroll()
    feed.dispose()
    if (menuId) closeInfinityMenu()
  })

  rememberNavigation(`actionEvents`, () => ({ stateKey: history.save(feed.state), query: feed.state.query,
    anchor: virtualList?.getAnchor() ?? session.anchor, scrollTop: body?.scrollTop ?? session.scrollTop ?? 0 }),
    async saved => {
      const snapshot = history.get(saved.stateKey)
      if (!snapshot) return
      restoring = true
      closeInfinityMenu()
      feed.restore(snapshot)
      await restoreScroll(saved.anchor, saved.scrollTop)
    }, saved => saved.query)

  async function restoreScroll(anchor = savedAnchor, top = savedTop): Promise<void> {
    await tick()
    await virtualList?.restoreAnchor(anchor ?? null, top)
    atTop = (body?.scrollTop ?? 0) <= 24
    restoring = false
  }

  function rememberScroll(): void {
    if (!body?.isConnected || restoring) return
    session.scrollTop = body.scrollTop
    session.anchor = virtualList?.getAnchor() ?? null
  }

  function focusId(target: EventTarget | null): number | null {
    const id = target instanceof Element ? target.closest<HTMLElement>(`[data-action-event]`)?.dataset.actionEvent : null
    return id ? Number(id) : null
  }

  function scroll(): void {
    if (restoring || !body) return
    atTop = body.scrollTop <= 24
    if (!atTop) feed.pause()
    rememberScroll()
    checkEnd()
  }

  function checkEnd(): void {
    if (!restoring && isActive && documentVisible && body && state.nextCursor && !state.loading && state.failedOperation !== `append`
      && body.scrollHeight - body.scrollTop - body.clientHeight < 250) void feed.append()
  }

  async function checkEndAfterRender(): Promise<void> {
    await tick()
    checkEnd()
  }

  async function changeQuery(query: ActionEventsQuery): Promise<void> {
    await navigation.visit(async () => {
      restoring = true
      closeInfinityMenu()
      if (body) body.scrollTop = 0
      atTop = true
      await feed.setQuery(query)
      await tick()
      if (body) body.scrollTop = 0
      restoring = false
    })
  }

  async function resume(): Promise<void> {
    restoring = true
    await feed.resume()
    if (state.mode === `live` && !state.error) {
      await tick()
      if (body) body.scrollTop = 0
      atTop = true
    }
    restoring = false
  }

  async function cancel(id: number): Promise<void> {
    await feed.cancel(id)
    void actionEventsPendingCount.refresh()
    announcement = state.error || `Request cancelled`
    if (!state.items.some(item => item.id === id)) {
      await tick()
      body?.focus({ preventScroll: true })
    }
  }

  function openServer(id: number): void {
    rememberScroll()
    onOpenServer(id)
  }

  function openPlayer(player: ActionEventsPlayer): void {
    if (!player.canOpen) return
    rememberScroll()
    onOpenPlayerProfile({ index: 0, name: player.name, playfabId: player.playfabId, rawLine: ``, normalizedName: null, livePlayer: null, dbPlayer: null,
      isLive: false, dbId: player.id, dbLatestName: player.name, dbLatestNormalizedName: null, isOnline: false, lastLogin: null, playtimeHours: null, activeBanKind: null })
  }
</script>

<section class="action-events panel-view" aria-label="Action Events">
  <PanelHeader title="Action Events"><svelte:fragment slot="trailing">
    <div class="action-events__summary">
      <span class:action-events__live={state.mode === `live`}><span class="action-events__dot"></span>{state.mode === `live` ? `Live` : `Paused`}</span>
      <span class="action-events__count">{state.items.length.toLocaleString()}{state.total === null ? `` : ` / ${state.total.toLocaleString()}`} events</span>
    </div>
  </svelte:fragment></PanelHeader>
  <div class="action-events__toolbar"><ActionEventsFilters query={state.query} {catalog} canViewAllTeams={Boolean($authState.user?.isSuperadmin)} bind:advancedOpen={advancedFiltersOpen} onChange={query => void changeQuery(query)} /></div>
  {#if state.error}<div class="action-events__notice" role="alert"><span>{state.error}</span>{#if state.failedOperation}<Button label="Try again" size="sm" disabled={Boolean(state.loading)} onClick={() => void feed.retry()} />{/if}</div>{/if}
  {#if state.mode === `browsing` && atTop && canFollowActionEvents(state.query)}<div class="action-events__resume"><Button label={state.loading === `resume` ? `Resuming…` : `Resume real-time`} icon="fa-play" variant="primary" disabled={Boolean(state.loading)} onClick={() => void resume()} /></div>{/if}
  <!-- svelte-ignore a11y_no_noninteractive_tabindex (The scroll region supports keyboard browsing and focus after cancellation.) -->
  <div bind:this={body} class="action-events__body" role="region" aria-label="Action event list" tabindex="0" aria-busy={state.loading === `initial` || state.loading === `resume`}
    on:scroll={scroll} on:focusin={input => focusedId = focusId(input.target)} on:focusout={input => focusedId = focusId(input.relatedTarget)}>
    {#if !state.items.length}
      {#if state.loading}<div class="action-events__loading" role="status"><Icon name="fa-circle-notch fa-spin" />Loading actions…</div>
      {:else if !state.error}<EmptyState title="No matching actions" message="Try another search, team, status or time range." />{/if}
    {:else}
      <ActionEventsVirtualList bind:this={virtualList} items={state.items} scrollElement={body} {pinnedIds} let:event>
        <ActionEventRow {event} entering={enteringIds.includes(event.id)} busy={state.pendingIds.includes(event.id)} actions={{ onCancel: id => void cancel(id), onOpenPlayer: openPlayer, onOpenServer: openServer }} />
      </ActionEventsVirtualList>
      <div class="action-events__end">
        {#if state.loading === `append`}<span role="status">Loading older actions…</span>
        {:else if state.nextCursor && state.failedOperation !== `append`}<Button label="Load older actions" size="sm" disabled={Boolean(state.loading)} onClick={() => void feed.append()} />
        {:else if !state.nextCursor}<span>You're all caught up.</span>{/if}
      </div>
    {/if}
  </div>
  <span class="action-events__announcement" aria-live="polite" aria-atomic="true">{announcement}</span>
</section>

<style lang="scss">
  .action-events { position: relative; container-type: inline-size; display: flex; flex-direction: column; height: 100%; min-height: 0; padding-top: var(--panel-padding); gap: var(--gutter-md); }
  .action-events__toolbar, .action-events__notice, .action-events__resume { margin: 0 var(--panel-padding); }
  .action-events__summary { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: var(--gutter-sm) var(--gutter-md); align-items: center; min-height: calc(var(--font-size-3xl) * 1.08); color: var(--color-light-tertiary); font-size: var(--font-size-xs); }
  .action-events__summary > span:first-child { display: inline-flex; gap: var(--gutter-sm); align-items: center; }
  .action-events__live { color: var(--color-accent-secondary); }
  .action-events__dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: currentColor; }
  .action-events__count { white-space: nowrap; }
  .action-events__notice { display: flex; gap: var(--gutter-md); align-items: center; justify-content: space-between; font-size: var(--font-size-xs); color: var(--color-accent-tertiary); }
  .action-events__resume { display: flex; justify-content: center; }
  .action-events__body { flex: 1 1 0; min-height: 0; overflow-y: auto; overflow-x: hidden; overflow-anchor: none; padding: 0 var(--panel-padding) var(--panel-padding); scrollbar-gutter: stable; }
  .action-events__body:focus-visible { outline: 1px solid var(--color-accent-primary); outline-offset: -2px; }
  .action-events__loading { display: flex; align-items: center; justify-content: center; gap: var(--gutter-md); padding: var(--panel-padding); color: var(--color-light-secondary); font-size: var(--font-size-caption); }
  .action-events__end { display: flex; justify-content: center; padding: var(--panel-padding); font-size: var(--font-size-caption); color: var(--color-light-tertiary); }
  .action-events__announcement { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @container (max-width: 530px) { .action-events__summary { display: grid; justify-items: end; } }
</style>
