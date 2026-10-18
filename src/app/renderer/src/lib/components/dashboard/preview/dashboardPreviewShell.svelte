<script lang="ts">
  import MenuBar from '$lib/components/navigation/menuBar.svelte'
  import Button from '$lib/components/ui/Button.svelte'
  import TooltipLayer from '$lib/components/app/TooltipLayer.svelte'
  import DashboardPreview from './dashboardPreview.svelte'
  import type { UserSession } from '$lib/core'
  import type { ActivePage } from '$lib/types/ui'
  import { dashboardPreviewAdmins } from './dashboardPreviewData'
  import '../../../../styles/style.scss'
  let notice = $state(``)
  const user: UserSession = { id: 1, discordId: null, username: `sample-admin`, displayName: `MAGIC`, playfabId: null, avatarUrl: dashboardPreviewAdmins[0].avatar, isActive: true, isSuperadmin: false, wantedCreationEnabled: false, onboardingComplete: true }
  const selectPage = (page: ActivePage) => { notice = page === `dashboard` ? `` : `Dashboard preview · ${page}` }
</script>

<div class="preview-desktop">
  <div class="overlay-shell overlay-shell--menuBar overlay-shell--visible overlay-shell--dashboard">
    <MenuBar activePage="dashboard" {user} onSelectPage={selectPage} onLogout={async () => {}} />
    <div class="open-stage">{#if notice}<small>{notice}</small>{/if}</div>
    <aside class="content-sidebar" aria-label="Overlay content"><DashboardPreview /></aside>
    <div class="quick-actions" aria-label="Quick Actions preview"><Button label="Adminsay" size="sm" disabled /><Button label="Serversay" size="sm" disabled /><Button label="Anti-AFK" size="sm" disabled /><Button label="SENTINEL MODE" size="sm" disabled /></div>
  </div>
</div>
<TooltipLayer />

<style lang="scss">
  .preview-desktop { width: 100vw; height: 100vh; background: radial-gradient(ellipse at 30% 25%, #101a23, #05090d 70%); }
  .content-sidebar { grid-column: 3; min-width: 0; min-height: 0; height: 100%; border-radius: 22px; overflow: hidden; background: linear-gradient(150deg, #0d1b27, #060e15 75%); box-shadow: var(--shadow); }
  .quick-actions { display: flex; gap: var(--gutter-sm); position: absolute; left: 50%; top: 30px; transform: translateX(calc(-50% + var(--quick-actions-offset-x))); padding: calc(var(--gutter) * 0.25); border: 1px solid var(--color-dark-tertiary); border-radius: var(--radius-xl); background: rgbaa(var(--color-dark-primary), 0.94); }
  .quick-actions :global(.ui-button) { padding: 0 var(--gutter-md); border-color: var(--color-dark-tertiary); background: transparent; }
  .open-stage { display: grid; align-content: end; justify-content: center; padding-bottom: 50px; min-width: 0; }
  .open-stage small { color: var(--color-light-tertiary); font-size: 11px; }
  @media (max-width: 850px) { .quick-actions { display: none; } }
  @media (prefers-reduced-motion: reduce) { :global(.preview-desktop *) { animation-duration: 0s !important; transition-duration: 0s !important; } }
</style>
