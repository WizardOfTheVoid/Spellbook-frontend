import type { DashboardPeriod, DashboardViewModel } from './dashboardViewModel'

export const dashboardPeriodLabels: Record<DashboardPeriod, string> = { allTime: `All time`, '30Days': `Last 30 days`, '1Week': `Last week`, '24Hours': `Last 24 hours`, lastHour: `Last hour` }
export function dashboardScopeLabel(data: DashboardViewModel): string {
  const environment = data.query.environment === `you` ? `You` : data.query.environment === `team` ? `Your teams` : `Global`
  return `${environment} · ${dashboardPeriodLabels[data.query.period]}`
}
export function createDashboardPresentation(data: DashboardViewModel, now = new Date(), locale: Intl.LocalesArgument = `en-US`) {
  const number = new Intl.NumberFormat(locale)
  const money = new Intl.NumberFormat(locale, { style: `currency`, currency: `USD`, maximumFractionDigits: 0 })
  const count = (value: number | null) => value === null ? `—` : number.format(value)
  const seconds = data.live.latest ? Math.max(0, Math.floor((now.getTime() - Date.parse(data.live.latest.at)) / 1000)) : 0
  const age = seconds < 60 ? `${seconds}s ago` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ago` : `${Math.floor(seconds / 3600)} hrs ago`
  return { count, currency: (value: number | null) => value === null ? `—` : money.format(value), scope: dashboardScopeLabel(data), age }
}
