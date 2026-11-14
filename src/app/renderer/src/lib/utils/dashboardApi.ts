import { parseDashboardQuery, parseDashboardTimelineQuery, type DashboardQuery } from '@spellbook/shared/dashboard.js'
import { parseDashboardSnapshot, parseDashboardTimelineData } from '@spellbook/shared/dashboardValidation.js'
import { getServerApi } from '$lib/core'
import { unwrap } from './apiResult'
import { dashboardQueryKey, type DashboardDataSource } from '$lib/components/dashboard/dashboardViewModel'

export function createDashboardApiSource(bridge = getServerApi().dashboard): DashboardDataSource {
  let selected: DashboardQuery | null = null
  return {
    async load(input) {
      const query = parseDashboardQuery(input)
      const data = parseDashboardSnapshot(await unwrap(await bridge.get(query), `Dashboard unavailable`))
      if (dashboardQueryKey(data.query) !== dashboardQueryKey(query)) throw new Error(`Dashboard scope did not match the request.`)
      selected = query
      return data
    },
    async loadTimeline(input) {
      return parseDashboardTimelineData(await unwrap(await bridge.timeline(parseDashboardTimelineQuery(input)), `Timeline unavailable`))
    },
    async loadLeaderboard(input) {
      if (!selected) throw new Error(`Load a dashboard before its rankings.`)
      const data = parseDashboardSnapshot(await unwrap(await bridge.get(selected), `Rankings unavailable`))
      const rows = data.scoreboards[input.kind]
      return { rows: rows.slice((input.page-1)*input.pageSize, input.page*input.pageSize), total: rows.length, page: input.page, pageSize: input.pageSize, asOf: data.generatedAt }
    }
  }
}
