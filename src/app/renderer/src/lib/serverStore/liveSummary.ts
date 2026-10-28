import type { ServerLiveSummary } from '@spellbook/shared/serverStore'

export function expireSummary(summary: ServerLiveSummary, receivedAt: number, now: number): ServerLiveSummary {
  const serverNow = Date.parse(summary.serverTime) + Math.max(0, now - receivedAt)
  const sources = Object.fromEntries(Object.entries(summary.sources).map(([source, sample]) => [source, {
    ...sample, fresh: sample.fresh && sample.expiresAt !== null && serverNow < Date.parse(sample.expiresAt)
  }])) as typeof summary.sources
  const population = summary.population.source && sources[summary.population.source].fresh
    ? summary.population : { count: null, source: null, observedAt: null }
  return { ...summary, sources, population }
}
