import type { TriangulationMapServer, TriangulationProfile } from '@spellbook/shared/forensics/triangulation'
import type { PingSummary } from '@spellbook/shared/forensics/altVectors'
import type { GeoMapMarker, GeoMapCircle, GeoMapRegion } from '../ui/maps/geoMapTypes'
import { isMapCoordinate } from '../ui/maps/geoMapGeometry'

type PopupServer = TriangulationMapServer & { visited: boolean, ping: PingSummary | null }

export function createTriangulationMap(profile: TriangulationProfile) {
  const sources = new Map<number, PopupServer>()
  for (const server of profile.map?.servers ?? []) sources.set(server.serverId, { ...server, visited: false, ping: null })
  for (const server of profile.servers) if (server.location) sources.set(server.serverId, { ...server, location: server.location, visited: true })
  const groups = new Map<string, PopupServer[]>()
  for (const server of sources.values()) {
    if (!server.location || !isMapCoordinate(server.location.latitude, server.location.longitude)) continue
    const key = `${server.location.latitude}:${server.location.longitude}`
    const group = groups.get(key) ?? []
    group.push(server)
    groups.set(key, group)
  }
  const markers: GeoMapMarker[] = []
  const circles: GeoMapCircle[] = []
  const estimate = profile.estimate?.status === `regionAvailable` ? profile.estimate : null
  const hasEstimate = Boolean(estimate?.circle)
  for (const [id, servers] of groups) {
    servers.sort((a, b) => Number(b.visited) - Number(a.visited) || a.serverId - b.serverId)
    const location = servers[0]!.location!
    const visited = servers.filter(server => server.visited)
    const name = servers[0]!.serverName ?? `Server ${servers[0]!.serverId}`
    markers.push({ id, latitude: location.latitude, longitude: location.longitude, count: visited.length || servers.length,
      tone: visited.length ? `accent` : `muted`, fit: !hasEstimate && visited.length > 0,
      label: `${name}${servers.length > 1 ? ` · ${visited.length}/${servers.length} visited` : visited.length ? ` · Visited` : ` · No player pings`}` })
    const radii = visited.map(server => server.location.accuracyRadiusKm).filter((radius): radius is number => radius !== null && Number.isFinite(radius) && radius >= 0)
    if (radii.length) circles.push({ id: `uncertainty:${id}`, markerId: id, radiusMeters: Math.max(...radii) * 1000, kind: `locationUncertainty`, fit: !hasEstimate })
  }
  if (estimate?.circle) circles.push({ id: `player-region`, ...estimate.circle, radiusMeters: estimate.circle.radiusKm * 1000, kind: `regionExtent` })
  return { markers, circles, serversByMarker: groups, region: (estimate?.region ?? null) as GeoMapRegion }
}

export function createServerLocationPopup(servers: readonly PopupServer[], document: Document): HTMLElement {
  const popup = document.createElement(`div`)
  for (const server of servers) {
    const entry = document.createElement(`div`)
    const title = document.createElement(`strong`)
    title.textContent = server.serverName ?? `Server ${server.serverId}`
    const ping = document.createElement(`span`)
    ping.textContent = server.ping ? `${server.ping.medianMs ?? `—`} ms · ${server.ping.sampleCount} readings${server.deleted ? ` · Removed` : ``}` : `No saved player pings`
    const baseline = document.createElement(`small`)
    baseline.textContent = server.backendPingContext ? `SpellBook ${server.backendPingContext.pingMs} ms · ${new Date(server.backendPingContext.observedAt).toLocaleString()}` : ``
    const provenance = document.createElement(`small`)
    provenance.textContent = [server.location?.accuracyRadiusKm === null ? `Radius unknown` : `±${server.location?.accuracyRadiusKm} km`,
      server.location?.source, server.location?.checkedAt ? new Date(server.location.checkedAt).toLocaleDateString() : null].filter(Boolean).join(` · `)
    entry.append(title, ping, baseline, provenance)
    popup.append(entry)
  }
  return popup
}
