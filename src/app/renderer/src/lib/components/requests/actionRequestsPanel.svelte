<script lang="ts">
  import PanelHeader from '$lib/components/ui/PanelHeader.svelte'
  import Tabs from '$lib/components/ui/tabs.svelte'
  import Wip from '$lib/components/ui/wip.svelte'
  import { navigation, rememberNavigation } from '$lib/navigation/navigation'

  let activeTab = `ongoing`
  const tabs = [{ value: `ongoing`, label: `On-going` }, { value: `history`, label: `History` }]
  rememberNavigation(`actionRequestsTab`, () => activeTab, value => { activeTab = value }, value => value)

  async function selectTab(value: string): Promise<void> {
    await navigation.visit(() => { activeTab = value })
  }
</script>

<section class="action-requests panel-view" aria-label="Action requests">
  <PanelHeader title="Action requests" />
  <div class="action-requests__content">
    <Tabs items={tabs} value={activeTab} label="Action requests" fill onChange={value => void selectTab(value)}>
      <Wip />
    </Tabs>
  </div>
</section>

<style>
  .action-requests { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: var(--gutter-lg); min-height: 0; height: 100%; padding-top: var(--gutter-lg); }
  .action-requests__content { min-height: 0; overflow: auto; padding: 0 var(--gutter-lg) var(--gutter-lg); }
</style>
