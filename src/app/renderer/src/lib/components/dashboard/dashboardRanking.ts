import type { DashboardRank } from './dashboardViewModel'

export function rankDashboardRows(rows: readonly DashboardRank[]): DashboardRank[] {
  return [...rows].sort((a, b) => b.count - a.count || a.rank - b.rank || a.id.localeCompare(b.id)).map((row, index) => ({ ...row, rank: index + 1 }))
}
