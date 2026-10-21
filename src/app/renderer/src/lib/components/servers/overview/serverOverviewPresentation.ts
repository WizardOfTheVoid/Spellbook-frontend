import type { GameServerRecord } from '$lib/core'
import type { ServerLiveSummary } from '@spellbook/shared/serverStore'
import type { ServerPopulationHistory } from '@spellbook/shared/gameServerOverview'
import type { DashboardTimelineData } from '$lib/components/dashboard/dashboardViewModel'
import { formatFullDateTime } from '$lib/utils/playerUtils'

const countries = new Intl.DisplayNames([`en`], { type: `region` })

export function serverInformationFields(server: GameServerRecord, live: ServerLiveSummary | null) {
  const country = server.geoCountryCode && /^[A-Z]{2}$/u.test(server.geoCountryCode) ? countries.of(server.geoCountryCode) : server.geoCountryCode
  const endpoint = server.host && server.port !== null && server.port !== undefined ? `${server.host.includes(`:`) ? `[${server.host}]` : server.host}:${server.port}` : null
  return [
    { label: `Address`, value: endpoint },
    ...(server.displayName && server.displayName !== server.name ? [{ label: `Reported name`, value: server.name }] : []),
    { label: `Location`, value: [server.geoCity, country].filter(Boolean).join(`, `) || null },
    { label: `Ping`, value: live?.sources.a2s.fresh && live.ping !== null ? `${live.ping} ms` : null },
    { label: `Password`, value: live?.sources.a2s.fresh && live.password !== null ? live.password ? `Required` : `Not required` : null }
  ]
}

export function serverTechnicalDetails(server: GameServerRecord) {
  return {
    pending: !server.geoCheckedAt && !server.geoSource,
    hasLocation: [server.geoLatitude, server.geoLongitude, server.geoCountryCode, server.geoCity, server.geoTimezone].some(value => value !== null && value !== undefined),
    hasCoordinates: [server.geoLatitude, server.geoLongitude].some(value => value !== null && value !== undefined),
    fields: [
      { label: `Latitude`, value: server.geoLatitude },
      { label: `Longitude`, value: server.geoLongitude },
      { label: `Accuracy radius`, value: server.geoAccuracyRadiusKm === null || server.geoAccuracyRadiusKm === undefined ? null : `${server.geoAccuracyRadiusKm} km` },
      { label: `Timezone`, value: server.geoTimezone },
      { label: `Source`, value: server.geoSource === `maxmind` ? `MaxMind` : server.geoSource },
      { label: `Last lookup`, value: server.geoCheckedAt ? formatFullDateTime(server.geoCheckedAt) : null }
    ]
  }
}

export function serverPopulationTimeline(history: ServerPopulationHistory): DashboardTimelineData {
  return {
    range: { start: Date.parse(history.start), end: Date.parse(history.end) },
    intervalMs: history.intervalMs,
    buckets: history.buckets.map(bucket => bucket.at),
    series: [{ id: `players`, label: `Average players`, color: `var(--color-accent-primary)`, values: history.buckets.map(bucket => bucket.value === null ? null : Math.round(bucket.value * 10) / 10) }]
  }
}
