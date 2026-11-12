import type { TelemetryEvent, TelemetryPlayer, TelemetrySnapshot, TelemetryTab } from '../session/telemetryModels'
import { eventTabKinds } from '../events/eventFeedFilters'

const itemKinds = new Set<TelemetryEvent[`kind`]>(eventTabKinds.items)
const combatKinds = new Set<TelemetryEvent[`kind`]>(eventTabKinds.combat)

export function aggregateItemEvents(events: TelemetryEvent[]): TelemetryEvent[] {
  const result: TelemetryEvent[] = []
  const groups = new Map<string, TelemetryEvent>()
  for (const event of events) {
    if (!itemKinds.has(event.kind) || event.kind === `inventoryChanged`) {
      result.push(event)
      continue
    }
    const key = [Math.floor(event.timeMs / 1000), event.kind, event.itemClass, event.relationship, event.actorId, event.targetId].join(`|`)
    const existing = groups.get(key)
    if (existing) existing.count += event.count
    else {
      const group = { ...event }
      groups.set(key, group)
      result.push(group)
    }
  }
  return result
}

export function selectEvents(snapshot: TelemetrySnapshot, selectedId: string | null, tab: TelemetryTab) {
  return snapshot.events.filter(event => {
    if (selectedId && event.actorId !== selectedId && event.targetId !== selectedId && !event.contributorIds.includes(selectedId)) return false
    if (tab === `kills`) return event.kind === `death` || event.kind === `disconnect`
    if (tab === `combat`) return combatKinds.has(event.kind)
    if (tab === `items`) return itemKinds.has(event.kind)
    return true
  })
}

export function playerLabel(player: TelemetryPlayer | null | undefined) {
  return player?.name ?? (player ? `Unknown · ${player.id}` : `Unknown player`)
}
