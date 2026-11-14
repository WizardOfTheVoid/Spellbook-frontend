import type { DashboardViewModel } from './dashboardViewModel'

export function createDashboardMoneyCue(play: () => void) {
  let previous: { key: string, amount: number } | null = null
  return (data: DashboardViewModel | null) => {
    if (!data || data.metrics.money === null) return
    const key = [data.query.environment, data.query.period].join(`:`)
    const amount = data.metrics.money
    const changed = previous?.key === key && previous.amount !== amount
    previous = { key, amount }
    if (changed) play()
  }
}
