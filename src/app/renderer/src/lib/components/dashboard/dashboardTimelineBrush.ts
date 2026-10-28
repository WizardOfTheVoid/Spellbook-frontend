import type { DashboardTimeRange } from './dashboardViewModel'

export function dashboardBrushRange(selection: readonly (number | Date | string | null)[], bounds: DashboardTimeRange): DashboardTimeRange {
  const [first, last] = selection
  if (first === null || first === undefined || last === null || last === undefined) return bounds
  const value = (date: number | Date | string) => typeof date === `string` ? Date.parse(date) : Number(date)
  const minimum = Math.min(60000, bounds.end - bounds.start)
  const end = Math.max(bounds.start + minimum, Math.min(bounds.end, Math.round(value(last))))
  const start = Math.max(bounds.start, Math.min(end - minimum, Math.round(value(first))))
  return Number.isFinite(start) && Number.isFinite(end) ? { start, end } : bounds
}

export function dashboardBrushKeyRange(range: DashboardTimeRange, bounds: DashboardTimeRange, key: string, edge: `left` | `right` | `move`): DashboardTimeRange | null {
  if (![ `ArrowLeft`, `ArrowRight`, `Home`, `End` ].includes(key)) return null
  const step = Math.max(60000, Math.round((range.end - range.start) / 20))
  const delta = key === `ArrowLeft` ? -step : step
  if (edge === `move`) {
    const shift = key === `Home` ? bounds.start - range.start : key === `End` ? bounds.end - range.end : Math.max(bounds.start - range.start, Math.min(bounds.end - range.end, delta))
    return { start: range.start + shift, end: range.end + shift }
  }
  const value = key === `Home` ? bounds.start : key === `End` ? bounds.end : range[edge === `left` ? `start` : `end`] + delta
  return dashboardBrushRange(edge === `left` ? [value, range.end] : [range.start, value], bounds)
}
