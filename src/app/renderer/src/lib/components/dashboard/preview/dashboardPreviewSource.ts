import { createDashboardPreviewData, createDashboardPreviewTimeline, dashboardPreviewRanking, type DashboardPreviewScenario } from './dashboardPreviewData'
import type { DashboardDataSource } from '../dashboardViewModel'

export function createDashboardPreviewSource(scenario: DashboardPreviewScenario = `normal`): DashboardDataSource {
  let tick = 0
  return {
    load: async query => {
      if (scenario === `error` || scenario === `stale` && tick > 0) throw new Error(`The sample dashboard is temporarily unavailable.`)
      return createDashboardPreviewData(query, scenario, tick++)
    },
    loadTimeline: async query => createDashboardPreviewTimeline(query, scenario, Math.max(0, tick - 1)),
    loadLeaderboard: async query => {
      const rows = dashboardPreviewRanking(query.kind, scenario)
      return { rows: rows.slice((query.page - 1) * query.pageSize, query.page * query.pageSize), total: rows.length, page: query.page, pageSize: query.pageSize, asOf: query.asOf ?? `2026-09-29T12:00:00Z` }
    },
  }
}
