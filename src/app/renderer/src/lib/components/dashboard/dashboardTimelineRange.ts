import type { DashboardPeriod, DashboardTimelineData, DashboardTimeRange } from './dashboardViewModel'

const minute = 60000
const day = 86400000
const durations: Record<DashboardPeriod, number> = { allTime: Infinity, '30Days': 30 * day, '1Week': 7 * day, '24Hours': day, lastHour: 60 * minute }
const intervals = [minute, 2 * minute, 5 * minute, 15 * minute, 60 * minute, 6 * 60 * minute, day, 7 * day, 30 * day]

export function dashboardTimelineBounds(timeline: DashboardTimelineData): DashboardTimeRange {
  const start = Date.parse(timeline.buckets[0] ?? ``)
  const end = Date.parse(timeline.buckets.at(-1) ?? ``) + (timeline.intervalMs ?? day)
  return timeline.range ?? { start: Number.isFinite(start) ? start : 0, end: Number.isFinite(end) ? end : day }
}
export function dashboardTimeRange(timeline: DashboardTimelineData, period: DashboardPeriod): DashboardTimeRange {
  const bounds = dashboardTimelineBounds(timeline)
  return { start: Math.max(bounds.start, bounds.end - durations[period]), end: bounds.end }
}
export function dashboardTimelineInterval(range: DashboardTimeRange, maxBuckets = 180): number {
  const required = (range.end - range.start) / Math.max(1, maxBuckets)
  return intervals.find(interval => interval >= required) ?? Math.ceil(required / day) * day
}
export function rescopeDashboardTimeline(timeline: DashboardTimelineData, range: DashboardTimeRange, maxBuckets = 180): DashboardTimelineData {
  const intervalMs = Math.max(timeline.intervalMs ?? minute, dashboardTimelineInterval(range, maxBuckets))
  const groups = new Map<number, number[]>()
  timeline.buckets.forEach((bucket, index) => {
    const time = Date.parse(bucket)
    if (time < range.start || time >= range.end) return
    const group = Math.floor((time - range.start) / intervalMs)
    const indices = groups.get(group) ?? []
    indices.push(index)
    groups.set(group, indices)
  })
  const entries = [...groups.entries()]
  return {
    range, intervalMs,
    buckets: entries.map(([group]) => new Date(range.start + group * intervalMs).toISOString()),
    series: timeline.series.map(series => ({ ...series, values: entries.map(([, indices]) => indices.some(index => series.values[index] === null || series.values[index] === undefined) ? null : indices.reduce((total, index) => total + series.values[index]!, 0)) })),
  }
}
export function dashboardTimelineBudget(width: number): number {
  return Math.max(60, Math.min(120, Math.floor(width / 4)))
}
