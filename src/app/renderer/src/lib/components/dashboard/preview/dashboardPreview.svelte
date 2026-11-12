<script lang="ts">
  import { onMount } from 'svelte'
  import Select from '$lib/components/ui/Select.svelte'
  import Button from '$lib/components/ui/Button.svelte'
  import DashboardView from '../dashboardView.svelte'
  import { defaultDashboardQuery, type DashboardDataSource, type DashboardViewQuery } from '../dashboardViewModel'
  import { createDashboardState, type DashboardViewState } from '../dashboardState'
  import { createDashboardPreviewSource } from './dashboardPreviewSource'
  import { dashboardPreviewScenarios, type DashboardPreviewScenario } from './dashboardPreviewData'
  let { visible = true }: { visible?: boolean } = $props()
  let scenario = $state<DashboardPreviewScenario>(`normal`)
  let source = $state<DashboardDataSource>(createDashboardPreviewSource())
  let viewState = $state.raw<DashboardViewState>({ query: { ...defaultDashboardQuery }, data: null, loading: true, error: null, secondsUntilRefresh: null })
  let selected = $state(``)
  let controller: ReturnType<typeof createDashboardState> | null = null
  function reset(next: DashboardPreviewScenario) {
    controller?.destroy()
    scenario = next
    source = createDashboardPreviewSource(scenario)
    const query = scenario === `noTeam` ? { ...viewState.query, environment: `global` as const } : viewState.query
    viewState = { query, data: null, loading: true, error: null, secondsUntilRefresh: null }
    selected = ``
    controller = createDashboardState({ source, query, onChange: value => { viewState = value } })
    controller.setVisible(visible && !document.hidden)
    if (scenario !== `loading`) void controller.start()
  }
  onMount(() => {
    reset(scenario)
    const syncVisibility = () => controller?.setVisible(visible && !document.hidden)
    document.addEventListener(`visibilitychange`, syncVisibility)
    return () => {
      controller?.destroy()
      document.removeEventListener(`visibilitychange`, syncVisibility)
    }
  })
  $effect(() => { controller?.setVisible(visible && !document.hidden) })
  const setQuery = (query: DashboardViewQuery) => { void controller?.setQuery(query) }
  const now = $derived(viewState.data ? new Date(viewState.data.generatedAt) : undefined)
</script>

<div class="preview">
  <div class="view"><DashboardView state={viewState} {source} {now} onQueryChange={setQuery} onRetry={() => void controller?.refresh()} onOpen={entity => selected = `Selected: ${entity.name}`} /></div>
  <div class="controls" aria-label="Preview scenarios"><Select label="Preview scenario" showLabel={false} value={scenario} options={dashboardPreviewScenarios} onChange={value => reset(value as DashboardPreviewScenario)} /><Button label="Refresh" icon="fa-rotate-right" size="sm" onClick={() => void controller?.refresh()} disabled={scenario === `loading`} />{#if selected}<small role="status">{selected}</small>{/if}</div>
</div>

<style lang="scss">
  .preview { display: flex; flex-direction: column; height: 100%; min-width: 0; min-height: 0; }
  .view { flex: 1; min-height: 0; }
  .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; padding: 9px 26px; border-top: 1px solid var(--color-dark-secondary); }
  .controls :global(.ui-select) { width: 190px; }
  small { color: var(--color-light-tertiary); font-size: 11px; }
</style>
