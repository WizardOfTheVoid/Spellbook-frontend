import type { TelemetryEvent, TelemetryEventKind, TelemetrySnapshot } from '../session/telemetryModels'

export type EventFeedTab = `kills` | `combat` | `items`
export type EventFeedFilter = { query: string, kind: string }

export const eventKindLabels: Record<TelemetryEventKind, string> = {
  death: `Death`, disconnect: `Disconnect`, damage: `Damage`, heal: `Healing`,
  attackStart: `Attack requested`, attackCancel: `Cancellation requested`,
  itemObserved: `Observed`, itemDestroyed: `Destroyed`, inventoryChanged: `Inventory change`,
  abilityInitiated: `Ability invocation initiated`, abilityInvocationCompleted: `Ability invocation completed`,
  abilityRequested: `Ability requested`, heavyAttackDecision: `Heavy attack decision`,
  heldInputAdded: `Held input added`, heldInputRemoved: `Held input removed`, parryRequested: `Parry requested`,
  statusChanged: `Status update`, combatStateChanged: `Combat state update`, playerStateUpdated: `Player state update`,
  playerStatistics: `Statistics update`,
  accountStateObserved: `Account observed`, componentStateObserved: `Unassigned component state`,
  inventoryClassChanged: `Item type updated`,
  itemReappeared: `Reappeared`, itemDormant: `Dormant`, itemNoLongerRelevant: `No longer relevant`,
  itemChannelClosed: `Channel closed`, itemTornOff: `Replication detached`,
  itemOwnerChanged: `Owner changed`, itemInstigatorChanged: `Instigator changed`,
  itemCoverageReset: `Item coverage reset`, itemClassified: `Item class resolved`,
  objectObserved: `Object observed`, objectReappeared: `Object reappeared`, objectDestroyed: `Object destroyed`,
  objectDormant: `Object dormant`, objectNoLongerRelevant: `Object no longer relevant`,
  objectChannelClosed: `Object channel closed`, objectTornOff: `Object replication detached`,
}

export const eventTabKinds: Record<EventFeedTab, TelemetryEventKind[]> = {
  kills: [`death`, `disconnect`],
  combat: [`damage`, `heal`, `attackStart`, `attackCancel`, `abilityInitiated`, `abilityInvocationCompleted`,
    `abilityRequested`, `heavyAttackDecision`, `heldInputAdded`, `heldInputRemoved`, `parryRequested`,
    `statusChanged`, `combatStateChanged`, `playerStateUpdated`, `playerStatistics`, `accountStateObserved`, `componentStateObserved`],
  items: [`itemObserved`, `itemDestroyed`, `inventoryChanged`, `inventoryClassChanged`, `itemReappeared`, `itemDormant`,
    `itemNoLongerRelevant`, `itemChannelClosed`, `itemTornOff`, `itemOwnerChanged`, `itemInstigatorChanged`,
    `itemCoverageReset`, `itemClassified`, `objectObserved`, `objectReappeared`, `objectDestroyed`,
    `objectDormant`, `objectNoLongerRelevant`, `objectChannelClosed`, `objectTornOff`],
}

export function filterEventFeed(events: readonly TelemetryEvent[], snapshot: TelemetrySnapshot, filter: EventFeedFilter) {
  const query = filter.query.trim().toLocaleLowerCase()
  const players = new Map(snapshot.players.map(player => [player.id, player]))
  return events.filter(event => {
    if (filter.kind && event.kind !== filter.kind) return false
    if (!query) return true
    const participants = [event.actorId, event.targetId, ...event.contributorIds].flatMap(id => {
      const player = id ? players.get(id) : null
      return [id, player?.name, player?.playFabId]
    })
    return [event.id, event.kind, eventKindLabels[event.kind], event.itemClass, event.relationship, event.detail, ...participants]
      .filter(Boolean).join(` `).toLocaleLowerCase().includes(query)
  })
}

export function sumEventAmount(events: readonly TelemetryEvent[], kind: TelemetryEventKind) {
  let total = 0
  for (const event of events) {
    if (event.kind !== kind) continue
    if (event.amount === null || !Number.isFinite(event.amount)) return null
    total += event.amount
  }
  return total
}

export function eventParticipants(event: TelemetryEvent) {
  const participants: { id: string, role: string }[] = []
  if (event.actorId) participants.push({
    id: event.actorId,
    role: event.relationship === `owner` ? `Owner` : event.relationship === `instigator` ? `Instigator` : event.kind === `death` ? `Related player` : event.kind === `disconnect` ? `Player` : `Source`,
  })
  if (event.targetId && event.targetId !== event.actorId) participants.push({ id: event.targetId, role: event.kind === `death` || event.kind === `disconnect` ? `Player` : `Target` })
  for (const id of event.contributorIds) {
    const existing = participants.find(participant => participant.id === id)
    const role = event.participantRoles?.[id] ?? `Contributor`
    if (existing) existing.role = role
    else participants.push({ id, role })
  }
  for (const participant of participants) participant.role = event.participantRoles?.[participant.id] ?? participant.role
  return participants
}
