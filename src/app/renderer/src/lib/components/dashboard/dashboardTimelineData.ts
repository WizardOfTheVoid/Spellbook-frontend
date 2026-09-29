import type { ChartConfig } from '$lib/components/evilcharts/ui/layerchart-chart/chart-config'
import type { DashboardTimelineData } from './dashboardViewModel'

const palette = Array.from({ length: 8 }, (_, index) => `var(--color-chart-${index + 1})`)
const actionColors: Record<string, string> = {
  ban: `var(--color-danger)`,
  kick: `var(--color-chart-2)`,
  unban: `var(--color-accent-secondary)`,
  warn: `var(--color-chart-4)`,
  serversay: `var(--color-accent-primary)`,
  adminsay: `var(--color-accent-quaternary)`,
}
export const dashboardHiddenSeries = [`serversay`, `adminsay`] as const
export const dashboardAverageId = `dashboard:average`
type DashboardChartData = { rows: Record<string, string | number | null>[], config: ChartConfig }
export function selectDashboardTimeline(timeline: DashboardTimelineData, hidden: readonly string[] = dashboardHiddenSeries): DashboardTimelineData {
  return { ...timeline, series: timeline.series.filter(series => !hidden.includes(series.id)) }
}
export function toggleDashboardSeries(hidden: readonly string[], id: string): string[] {
  return hidden.includes(id) ? hidden.filter(key => key !== id) : [...hidden, id]
}
export function dashboardSeriesColor(id: string): string {
  if (actionColors[id]) return actionColors[id]
  let hash = 0
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return palette[hash % palette.length]
}
export function cumulativeDashboardMoney(values: readonly number[]): number[] {
  let total = 0
  return values.map(value => total += value * 5)
}
export function withDashboardTimelineAverage(timeline: DashboardTimelineData): DashboardTimelineData {
  const series = timeline.series.filter(series => series.id !== dashboardAverageId)
  if (!series.length) return timeline
  const values = timeline.buckets.map((_, index) => series.some(series => series.values[index] === null || series.values[index] === undefined) ? null : series.reduce((sum, series) => sum + series.values[index]!, 0) / series.length)
  return { ...timeline, series: [...series, { id: dashboardAverageId, label: `Average`, color: `var(--white)`, values }] }
}
export function createDashboardChartData(timeline: DashboardTimelineData, previous?: DashboardChartData): DashboardChartData {
  const rows = timeline.buckets.map((bucket, index) => {
    const row = { bucket, ...Object.fromEntries(timeline.series.map(series => [series.id, series.values[index] ?? null])) }
    const old = previous?.rows[index]
    return old && Object.keys(old).length === Object.keys(row).length && Object.entries(row).every(([key, value]) => old[key] === value) ? old : row
  })
  const config = Object.fromEntries(timeline.series.map(series => {
    const color = series.color ?? dashboardSeriesColor(series.id)
    return [series.id, { label: series.label, colors: { light: [color], dark: [color] } }]
  })) as ChartConfig
  const oldKeys = Object.keys(previous?.config ?? {})
  const sameConfig = previous && oldKeys.length === timeline.series.length && timeline.series.every((series, index) => {
    const old = previous.config[series.id]
    return oldKeys[index] === series.id && old.label === config[series.id].label && old.colors?.light?.[0] === config[series.id].colors?.light?.[0] && old.colors?.dark?.[0] === config[series.id].colors?.dark?.[0]
  })
  return {
    rows: previous && rows.length === previous.rows.length && rows.every((row, index) => row === previous.rows[index]) ? previous.rows : rows,
    config: sameConfig ? previous.config : config,
  }
}
