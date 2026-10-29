<script lang="ts">
  import PanelHeader from '../ui/PanelHeader.svelte'
  import Tabs from '../ui/tabs.svelte'
  import Wip from '../ui/wip.svelte'
  import { navigation, rememberNavigation } from '$lib/navigation/navigation'

  export let accountId: number | null = null
  const tabs = [{ value: `releases`, label: `Releases` }, { value: `news`, label: `News` }, { value: `roadmap`, label: `Roadmap` }]
  let selected = `releases`
  let previousAccountId = accountId
  $: if (accountId !== previousAccountId) { selected = `releases`
    previousAccountId = accountId }
  rememberNavigation(`content`, () => ({ accountId, selected }), value => {
    selected = value.accountId === accountId && tabs.some(tab => tab.value === value.selected) ? value.selected : `releases`
  }, value => [value.accountId, value.selected])
</script>

<section class="content-panel panel-view" aria-label="Content">
  <PanelHeader title="Content" eyebrow="SpellBook" />
  <div class="content-panel__body">
    <Tabs items={tabs} value={selected} label="Content" onChange={value => void navigation.visit(() => { selected = value })}>
      <Wip />
    </Tabs>
  </div>
</section>

<style lang="scss">
  .content-panel { height: 100%; display: grid; grid-template-rows: auto minmax(0, 1fr); gap: var(--gutter-lg); padding-top: var(--gutter-lg); }
  .content-panel__body { min-height: 0; overflow: auto; padding: 0 var(--gutter-lg) var(--gutter-lg); }
</style>
