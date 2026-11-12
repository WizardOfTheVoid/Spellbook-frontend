import { mount } from 'svelte'

async function startDashboardPreview() {
  if (!import.meta.env.DEV) return
  const { default: DashboardPreviewShell } = await import('./lib/components/dashboard/preview/dashboardPreviewShell.svelte')
  mount(DashboardPreviewShell, { target: document.getElementById(`app`)! })
}
void startDashboardPreview()
