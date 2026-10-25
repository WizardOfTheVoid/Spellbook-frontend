<script lang="ts">
  import { onMount, untrack } from 'svelte'
  import { authState } from '$lib/auth/user'
  import { loadTimezone } from '$lib/settings/timezone'
  import DashboardView from './dashboardView.svelte'
  import { createDashboardApiSource } from '$lib/utils/dashboardApi'
  import { defaultDashboardQuery, type DashboardEntity, type DashboardViewQuery } from './dashboardViewModel'
  import { createDashboardState, type DashboardViewState } from './dashboardState'

  let { visible = true, onOpenYourServers = () => {}, onOpenServer = () => {}, onOpenTeam = () => {} }:
    { visible?: boolean, onOpenYourServers?: () => void, onOpenServer?: (id: number) => void, onOpenTeam?: (id: number) => void } = $props()
  const source = createDashboardApiSource()
  let viewState = $state.raw<DashboardViewState>({ query: defaultDashboardQuery, data: null, loading: true, error: null, secondsUntilRefresh: null })
  let controller: ReturnType<typeof createDashboardState> | null = null
  let mounted = $state(false)
  let documentVisible = $state(false)
  const active = $derived(mounted && visible && documentVisible)
  onMount(() => {
    const syncVisibility = () => { documentVisible = !document.hidden }
    syncVisibility()
    mounted = true
    document.addEventListener(`visibilitychange`, syncVisibility)
    return () => {
      controller?.destroy()
      document.removeEventListener(`visibilitychange`, syncVisibility)
    }
  })
  $effect(() => {
    const user = $authState.user
    if (mounted && user?.isActive) void loadTimezone().catch(error => console.warn(`Dashboard timezone could not be loaded`, error))
  })
  $effect(() => {
    const user = $authState.user
    const enabled = active && Boolean(user?.isActive)
    if (!mounted) return
    return untrack(() => {
      controller?.destroy()
      controller = null
      const query = viewState.query
      viewState = { query, data: null, loading: enabled, error: null, secondsUntilRefresh: null }
      if (!enabled) return
      const next = createDashboardState({ source, query, onChange: value => { viewState = value } })
      controller = next
      void next.start()
      return () => next.destroy()
    })
  })
  function open(entity: DashboardEntity) {
    const [kind, value] = entity.id.split(`:`)
    const id = Number(value)
    if (!Number.isSafeInteger(id) || id < 1) return
    if (kind === `server`) onOpenServer(id)
    if (kind === `team` && viewState.data?.teams.some(team => team.id === entity.id)) onOpenTeam(id)
  }
  const setQuery = (query: DashboardViewQuery) => { void controller?.setQuery(query) }
</script>

{#if active && $authState.user?.isActive}
  {#key $authState.user}
    <DashboardView {source} state={viewState} onQueryChange={setQuery} onRetry={() => void controller?.refresh()} onOpen={open} />
  {/key}
{/if}
