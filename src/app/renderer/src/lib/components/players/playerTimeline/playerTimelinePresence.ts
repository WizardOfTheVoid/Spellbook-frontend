import type { PlayerPresence } from '@spellbook/shared/playerPresence'
import type { PlayerTimelineEvent } from '@spellbook/shared/playerTimeline'

export type TimelineDisplayEvent = PlayerTimelineEvent & { current?: true }

export function timelineWithPresence(
  events: PlayerTimelineEvent[],
  presence: PlayerPresence | null | undefined
): TimelineDisplayEvent[] {
  const server = presence?.isOnline ? presence.server : null
  const observedAt = presence?.observedAt
  if (!server || !observedAt || !Number.isFinite(Date.parse(observedAt))) return events

  const laterServer = events.some(event => event.kind === `server`
    && event.segments?.some(segment => segment.target?.type === `server` && segment.target.id !== server.id)
    && Date.parse(event.details.find(item => item.label === `Last seen`)?.value ?? event.occurredAt) > Date.parse(observedAt))
  if (laterServer) return events

  const name = server.name.trim() || `Server #${server.id}`
  const current: TimelineDisplayEvent = {
    id: `presence:server:${server.id}`,
    kind: `server`,
    occurredAt: observedAt,
    details: [],
    current: true,
    summary: `Playing on ${name}`,
    segments: [
      { text: `Playing on ` },
      { text: name, target: { type: `server`, id: server.id }, tooltip: `Open server` }
    ]
  }

  return [current, ...events]
}
