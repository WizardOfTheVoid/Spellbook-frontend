import type { MetricSample } from '../session/telemetryModels'

export function metricHistoryRows(samples: readonly MetricSample[], cursorMs: number) {
  const rows: { timeMs: number, value: number | null }[] = []
  let lifetimeId: string | null = null
  for (const sample of [...samples].filter(sample => Number.isFinite(sample.timeMs) && sample.timeMs <= cursorMs).sort((left, right) => left.timeMs - right.timeMs)) {
    if (lifetimeId !== null && lifetimeId !== sample.lifetimeId) rows.push({ timeMs: sample.timeMs, value: null })
    rows.push({ timeMs: sample.timeMs, value: sample.value !== null && Number.isFinite(sample.value) ? sample.value : null })
    lifetimeId = sample.lifetimeId
  }
  return rows
}
