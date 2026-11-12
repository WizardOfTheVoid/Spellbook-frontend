import type {
  TelemetryApi, TelemetryFrame, TelemetryEvent as WorkerEvent, PlayerStateSnapshot,
  EventPage, MetricHistoryPage, TrajectoryPage, ReadView, PlayerPage
} from '../../../../../../../shared/telemetry/telemetryTypes'
import { eventTabKinds, type EventFeedFilter, type EventFeedTab } from '../events/eventFeedFilters'
import type { TelemetryEvent, TelemetryEventKind, TelemetryPlayer, TelemetrySnapshot, TelemetryTab } from './telemetryModels'
import { TelemetrySnapshotCache, type CohortRequest } from './telemetryReadScheduler'
import { selectDisplayPlayers } from './telemetryPlayerProjection'

export type TelemetryReadRequest = CohortRequest & {
  recordingId: string
  atUs: number
  revision: number
  generation: string
  selectedPlayerId: string | null
  selectedPlayerAnchorId?: string | null
  tab: TelemetryTab
  filter: EventFeedFilter
  page: number
  eventOffset?: number
  details: boolean
  catalog?: boolean
  rosterPage?: number
  rosterOffset?: number
  selectedLifetimeId?: string
}

const renamedKinds: Partial<Record<TelemetryEventKind, string>> = {
  heal: `healing`, attackStart: `attackRequested`, attackCancel: `attackCancelRequested`
}
const workerKinds = Object.fromEntries(Object.values(eventTabKinds).flat().map(kind =>
  [kind, [renamedKinds[kind] ?? kind]])) as Record<TelemetryEventKind, string[]>
const kindMap = Object.fromEntries(Object.entries(workerKinds).flatMap(([kind, names]) =>
  names.map(name => [name, kind]))) as Record<string, TelemetryEventKind>

const nullable = (value: number | null | undefined) => typeof value === `number` && Number.isFinite(value) ? value : null

function playerFromState(player: PlayerStateSnapshot, frame: TelemetryFrame): TelemetryPlayer {
  const account = player.observationKind === `account`
  const entity = account ? undefined : frame.entities.find(entity => entity.entityId === player.entityId)
  const position = entity?.position
  const playFabId = player.playFabId ?? null
  const direction = player.direction ?? entity?.direction
  return {
    id: player.trackId,
    name: account ? player.name ?? null : playFabId ? player.name ?? entity?.name ?? null : null,
    playFabId,
    direction: direction === `fromServer` || direction === `toServer` ? direction : undefined,
    observationKind: player.observationKind ?? `pawn`,
    aliases: player.aliases ?? [],
    firstSeenMs: player.elapsedUs / 1000,
    lastSeenMs: player.elapsedUs / 1000,
    present: player.active,
    lifetimeId: player.lifetimeId,
    health: nullable(player.health),
    maxHealth: nullable(player.maxHealth),
    stamina: nullable(player.stamina),
    position: position?.coordinateSpace === `world` && position.elapsedUs <= frame.atUs &&
      (player.active || position.elapsedUs <= player.elapsedUs && position.sequence <= player.sequence) ? position.location : null,
    speed: null,
    inventory: player.inventory?.map(slot => ({
      slot: `${slot.index}`,
      item: slot.itemGuid === null ? null : slot.itemGuid === 0 ? `Empty` : slot.classPath ?? `Item ${slot.itemGuid}`
    })) ?? [],
    inventoryKnown: Array.isArray(player.inventory),
    healthHistory: [],
    staminaHistory: [],
    damageDealt: nullable(player.damageDealt),
    damageTaken: nullable(player.damageReceived),
    deathCount: nullable(player.deaths),
    statuses: player.statuses?.flatMap(status => status.value === null ? [] : [`Status ${status.index}: ${status.value}`]) ?? [],
    combatState: nullable(player.combatState), attackIndex: nullable(player.attackIndex),
    score: nullable(player.score), profile: player.profile ?? null, detailTruncated: player.detailTruncated
  }
}

export function mapTelemetryEvent(event: WorkerEvent, _states: readonly PlayerStateSnapshot[]): TelemetryEvent | null {
  const kind = kindMap[event.kind]
  if (!kind) return null
  const relationship = event.item?.ownerGuid ? `owner` : event.item?.instigatorGuid ? `instigator` : null
  const actorId = event.player?.actor?.trackId ?? null
  const inventoryClass = kind === `inventoryClassChanged` ? event.player?.values?.classPath : null
  const participantRoles: Record<string, string> = {}
  for (const role of [`owner`, `instigator`] as const) {
    const reference = event.player?.values?.[role]
    if (reference && typeof reference === `object` && `trackId` in reference && typeof reference.trackId === `string`)
      participantRoles[reference.trackId] = role === `owner` ? `Owner` : `Instigator`
  }
  return {
    id: event.groupKey ?? `${event.sequence}:${event.ordinal}`,
    timeMs: event.elapsedUs / 1000,
    kind,
    actorId,
    targetId: event.player?.target?.trackId ?? null,
    contributorIds: [...new Set(event.player?.contributors?.flatMap(player => player.trackId ? [player.trackId] : []) ?? [])],
    itemClass: event.item?.classPath ?? (typeof inventoryClass === `string` ? inventoryClass : null),
    relationship,
    amount: nullable(event.player?.amount),
    count: event.count ?? 1,
    detail: event.detail,
    participantRoles,
    values: event.player?.values ?? undefined,
    reasonCode: event.player?.reasonCode,
    detailTruncated: event.detailTruncated
  }
}

function assertReadView(actual: ReadView | null | undefined, expected: ReadView) {
  if (!actual || actual.generation !== expected.generation || actual.throughSequence !== expected.throughSequence || actual.atUs !== expected.atUs)
    throw new Error(`Telemetry changed during this read. Try again.`)
}

export class TelemetryWorkerSource {
  private readonly cache = new TelemetrySnapshotCache<{ snapshot?: TelemetrySnapshot, catalog?: PlayerPage }>()
  private cancelled = { live: 0, replay: 0 }

  constructor(private readonly api: () => TelemetryApi) {}

  async cancel(request: CohortRequest) {
    this.cancelled[request.workspaceId] = Math.max(this.cancelled[request.workspaceId], request.requestId)
    await this.api().cancelReads({ workspaceId: request.workspaceId, throughRequestId: request.requestId })
  }

  private check(request: CohortRequest) {
    if (request.requestId <= this.cancelled[request.workspaceId]) throw new Error(`Telemetry read cancelled`)
  }

  async read(request: TelemetryReadRequest): Promise<TelemetrySnapshot> {
    this.check(request)
    const key = JSON.stringify([request.recordingId, request.generation, request.revision, request.atUs, request.selectedPlayerId, request.selectedPlayerAnchorId, request.tab, request.filter, request.page, request.eventOffset, request.details, request.rosterPage, request.rosterOffset, request.catalog])
    const cached = this.cache.get(key)?.snapshot
    if (cached) return cached
    const api = this.api()
    const context = { workspaceId: request.workspaceId, requestId: request.requestId }
    let frame = await api.getFrame({
      ...context, recordingId: request.recordingId, atUs: request.atUs,
      trackId: request.selectedPlayerId ?? undefined
    })
    this.check(request)
    const selectedAnchor = request.selectedPlayerAnchorId ?? request.selectedPlayerId
    const resolved = selectedAnchor ? frame.players?.find(player => player.trackId === selectedAnchor || player.aliases?.includes(selectedAnchor)) : undefined
    if (resolved && resolved.trackId !== request.selectedPlayerId) frame = await api.getFrame({
      ...context, recordingId: request.recordingId, atUs: request.atUs, trackId: resolved.trackId
    })
    this.check(request)
    const readView = frame.readView
    if (!readView) throw new Error(`This worker does not support consistent telemetry reads. Restart SpellBook.`)
    let states: PlayerStateSnapshot[] = frame.capabilities?.players ? frame.players ?? [] : frame.entities
      .filter(entity => entity.kind === `pawn`)
      .map(entity => ({
        trackId: entity.entityId, lifetimeId: entity.entityId, entityId: entity.entityId, actorGuid: entity.actorGuid,
        active: entity.active, elapsedUs: entity.position?.elapsedUs ?? 0, sequence: entity.position?.sequence ?? 0,
        playFabId: typeof entity.identityKnownAtUs === `number` && entity.identityKnownAtUs <= frame.atUs ? entity.playFabId : null
      }))
    const catalogKey = JSON.stringify([`catalog`, request.recordingId, readView.generation, frame.coverage.rosterRevision ?? readView.throughSequence, request.rosterOffset ?? 0])
    let catalog = this.cache.get(catalogKey)?.catalog
    if (catalog && catalog.readView.atUs > frame.atUs) catalog = undefined
    if (request.catalog && frame.capabilities?.players && !catalog) {
      catalog = await api.getPlayers({
        ...context, recordingId: request.recordingId, atUs: frame.atUs, offset: request.rosterOffset ?? 0,
        limit: 100, includeDeparted: true, readView
      })
      this.check(request)
      assertReadView(catalog.readView, readView)
      this.cache.set(catalogKey, { catalog })
    }
    if (catalog && catalog.readView.atUs <= frame.atUs) {
      const stateKey = (player: PlayerStateSnapshot) => JSON.stringify([player.trackId, player.lifetimeId])
      const byTrackLifetime = new Map(states.map(player => [stateKey(player), player]))
      for (const player of catalog.players) if (!byTrackLifetime.has(stateKey(player))) byTrackLifetime.set(stateKey(player), player)
      states = [...byTrackLifetime.values()]
    }
    if (request.selectedPlayerId && request.selectedLifetimeId && !states.some(player => player.trackId === request.selectedPlayerId)) {
      const selectedKey = `${catalogKey}:${request.selectedLifetimeId}:${frame.atUs}`
      let selected = this.cache.get(selectedKey)?.catalog
      if (!selected && request.catalog) {
        selected = await api.getPlayers({
          ...context, recordingId: request.recordingId, atUs: frame.atUs, lifetimeId: request.selectedLifetimeId,
          limit: 1, includeDeparted: true, readView
        })
        this.check(request)
        assertReadView(selected.readView, readView)
        this.cache.set(selectedKey, { catalog: selected })
      }
      if (selected) states.push(...selected.players)
    }
    const players = selectDisplayPlayers(states).map(player => playerFromState(player, frame))
    const selected = resolveTelemetrySelection(players, request.selectedPlayerId, request.selectedPlayerAnchorId)
    const selectedPlayerId = selected?.id ?? request.selectedPlayerId
    const detailsKey = JSON.stringify([request.recordingId, readView.generation, selectedPlayerId, request.tab,
      states.map(player => [player.trackId, player.lifetimeId, player.observationKind]), frame.coverage.continuityRevision, frame.coverage.lostPackets])
    const previous = this.cache.get(detailsKey)?.snapshot
    let events: EventPage | null = null
    let history: MetricHistoryPage | null = null
    let trajectories: TrajectoryPage | null = null
    if (request.tab === `kills` || request.tab === `combat` || request.tab === `items`) {
      events = await api.getEvents({
        ...context, recordingId: request.recordingId, fromUs: 0, toUs: frame.atUs,
        trackId: selectedPlayerId ?? undefined, readView,
        kinds: (request.filter.kind ? [request.filter.kind as TelemetryEventKind] : eventTabKinds[request.tab as EventFeedTab]).flatMap(kind => workerKinds[kind]),
        search: request.filter.query, offset: request.eventOffset ?? 0,
        limit: 100, groupItems: true, newestFirst: true
      })
      this.check(request)
      assertReadView(events.readView, readView)
    } else if (request.tab === `overview` && selectedPlayerId && selected?.observationKind !== `account` && request.details && frame.capabilities?.metricHistory) {
      history = await api.getMetricHistory({
        ...context, recordingId: request.recordingId, trackId: selectedPlayerId,
        fromUs: Math.max(0, frame.atUs - 60_000_000), toUs: frame.atUs,
        metrics: [`health`, `stamina`], maxPoints: 240, readView
      })
      this.check(request)
      assertReadView(history.readView, readView)
    } else if (request.tab === `map` && request.details && states.some(player => player.observationKind !== `account`)) {
      const mapPlayers = states.filter(player => player.observationKind !== `account`).sort((left, right) =>
        Number(right.trackId === selectedPlayerId) - Number(left.trackId === selectedPlayerId) ||
        Number(right.active) - Number(left.active))
      trajectories = await api.getTrajectories({
        ...context, recordingId: request.recordingId, fromUs: Math.max(0, frame.atUs - 30_000_000),
        toUs: frame.atUs, entityIds: [...new Set(mapPlayers.map(player => player.entityId))].slice(0, 64), maxPoints: 2048, readView
      })
      this.check(request)
      assertReadView(trajectories.readView, readView)
    }
    for (const player of players) {
      if (player.observationKind === `account`) continue
      const previousPlayer = previous?.players.find(value => value.id === player.id)
      for (const metric of [`health`, `stamina`] as const) {
        const field = metric === `health` ? `healthHistory` : `staminaHistory`
        const series = player.id === selectedPlayerId ? history?.series.find(series => series.metric === metric) : undefined
        player[field] = series?.points.map(point => ({
          timeMs: point.elapsedUs / 1000, value: point.value, lifetimeId: point.lifetimeId
        })) ?? previousPlayer?.[field].filter(point => point.timeMs <= frame.atUs / 1000 && point.timeMs >= frame.atUs / 1000 - 60_000) ?? []
      }
    }
    let remainingPoints = 2048
    const pathPlayers = new Map<string, PlayerStateSnapshot | null>()
    for (const player of states) {
      if (player.observationKind === `account`) continue
      if (!pathPlayers.has(player.entityId)) pathPlayers.set(player.entityId, player)
      else if (pathPlayers.get(player.entityId)?.trackId !== player.trackId) pathPlayers.set(player.entityId, null)
    }
    const paths = trajectories ? trajectories.paths.flatMap(path => {
      const player = pathPlayers.get(path.entityId)
      if (!player || path.coordinateSpace !== `world` || remainingPoints <= 0) return []
      const points = path.points.filter(point => point.coordinateSpace === `world` && point.elapsedUs <= frame.atUs)
        .slice(-remainingPoints).map(point => ({ timeMs: point.elapsedUs / 1000, position: point.location }))
      remainingPoints -= points.length
      return points.length ? [{ playerId: player.trackId, lifetimeId: player.lifetimeId, points }] : []
    }) : previous?.paths.map(path => ({ ...path, points: path.points.filter(point => point.timeMs <= frame.atUs / 1000 && point.timeMs >= frame.atUs / 1000 - 30_000) })) ?? []
    const counts = Object.fromEntries(Object.entries(workerKinds).map(([kind, names]) => [
      kind, names.reduce((sum, name) => sum + (frame.summary?.counts[name] ?? 0), 0)
    ]))
    const snapshot: TelemetrySnapshot = {
      timeMs: frame.atUs / 1000,
      resolvedSelectionId: selected?.id,
      players, paths,
      events: events?.events.flatMap(event => {
        const mapped = mapTelemetryEvent(event, states)
        return mapped ? [mapped] : []
      }) ?? [],
      totals: {
        players: frame.summary?.knownPlayers ?? players.length,
        present: frame.summary?.activePlayers ?? players.filter(player => player.present).length,
        damage: nullable(frame.summary?.damageDealt),
        deaths: nullable(frame.summary?.deaths),
        items: frame.summary ? eventTabKinds.items.reduce((sum, kind) => sum + (counts[kind] ?? 0), 0) : null
      },
      eventPage: events ? {
        page: request.page, total: events.matchingGroups ?? 0,
        hasNext: events.nextOffset !== undefined ? events.nextOffset !== null : events.nextSequence !== null,
        nextOffset: events.nextOffset ?? (events.nextSequence !== null ? (request.eventOffset ?? 0) + events.events.length : null),
        counts, amounts: { damage: nullable(frame.summary?.damageDealt), heal: nullable(frame.summary?.healAmount) }
      } : undefined,
      coverage: frame.coverage,
      richFieldsAvailable: frame.capabilities?.players ?? false,
      omittedMapPlayers: request.tab === `map` ? Math.max(0, new Set(states.filter(player => player.observationKind !== `account`).map(player => player.entityId)).size - 64) : 0,
      roster: catalog ? {
        playerIds: [...new Set(catalog.players.map(player => player.trackId))],
        page: request.rosterPage ?? 1, hasNext: catalog.nextOffset !== null, nextOffset: catalog.nextOffset
      } : undefined
    }
    if (request.details) {
      this.cache.set(detailsKey, { snapshot })
    }
    this.cache.set(key, { snapshot })
    return snapshot
  }
}

export function resolveTelemetrySelection(players: TelemetryPlayer[], selectedId: string | null, anchorId?: string | null) {
  if (!selectedId) return undefined
  const matches = (player: TelemetryPlayer, id: string) => player.id === id || player.aliases?.includes(id)
  return (anchorId ? players.find(player => matches(player, anchorId)) : undefined) ??
    players.find(player => matches(player, selectedId))
}
