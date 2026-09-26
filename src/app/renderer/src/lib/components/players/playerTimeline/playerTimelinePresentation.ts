import type { PlayerTimelineEvent } from '@spellbook/shared/playerTimeline'

export type TimelinePresentation = { icon: string, tone: `danger` | `warning` | `accent` | `neutral` }

export function timelinePresentation(event: PlayerTimelineEvent): TimelinePresentation {
  const icons: Record<string, string> = {
    action: `fa-gavel`,
    audit: `fa-rotate`,
    wanted: `fa-crosshairs`,
    note: `fa-note-sticky`,
    server: `fa-server`,
    progress: `fa-chart-line`,
    account: `fa-user`,
    meta: `fa-database`
  }
  const action = event.details.find(item => item.label === `Action`)?.value
  const tone = event.kind === `wanted` || action === `Ban` ? `danger`
    : action === `Warning` || action === `Kick` ? `warning`
    : event.kind === `progress` ? `accent`
    : `neutral`

  return { icon: icons[event.kind] ?? `fa-clock-rotate-left`, tone }
}
