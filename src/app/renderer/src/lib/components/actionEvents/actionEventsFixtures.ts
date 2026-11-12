import { actionEventsSearchText, actionEventsTeamIds, matchesActionEvent } from './actionEventsQuery'
import type { ActionEvent, ActionEventsAdmin, ActionEventsCatalog, ActionEventsSource } from './actionEventsTypes'

const actions: ActionEvent[`action`][] = [
  { label: `Ban`, iconKey: `ban`, commands: [{ commandType: `ban` }] },
  { label: `Kick`, iconKey: `triangle-exclamation`, commands: [{ commandType: `kick` }] },
  { label: `Warn`, iconKey: `bullhorn`, commands: [{ commandType: `warn` }] },
  { label: `Unban`, iconKey: `gavel`, commands: [{ commandType: `unban` }] },
  { label: `Warn & kick`, iconKey: `triangle-exclamation`, commands: [{ commandType: `warn` }, { commandType: `kick` }] },
  { label: `ServerSay`, iconKey: `bullhorn`, commands: [{ commandType: `server_message`, message: `Welcome! Respect the duel rules and have fun.` }] },
  { label: `AdminSay`, iconKey: `circle-info`, commands: [{ commandType: `admin_message`, message: `Admins: please keep an eye on the duel area.` }] }
]
const names = [`McNuggets`, `AllteX`, `The Black beard`, `TryH`, `Kira`, `Lunaris`, `Seven`, `Sir Bonks-a-Lot`]
const statuses: ActionEvent[`status`][] = [`completed`, `pending`, `completed`, `failed`, `claimed`, `completed`, `cancelled`, `submitting`, `completed`, `expired`, `unknown`, `superseded`]
const reasons = [`Repeated team damage`, `Disrupting duels`, `Offensive chat after a warning`, `Appeal accepted`, `Repeated harassment`, `Ignoring admin warnings`]

function portrait(name: string, color: string): string {
  return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${color}"/><stop offset="1" stop-color="#13202e"/></linearGradient></defs><rect width="72" height="72" fill="url(#g)"/><text x="36" y="46" text-anchor="middle" fill="#ecedf8" font-family="sans-serif" font-size="30">${name[0]}</text></svg>`)}`
}

export function createActionEventsMock({ count = 10_000, userId = 1, now = Date.now, simulate = true }:
  { count?: number, userId?: number, now?: () => number, simulate?: boolean } = {}): ActionEventsSource {
  const catalog: ActionEventsCatalog = {
    servers: [`TT Duel Server`, `MAGIC Duels`, `KRT Arena`, `Jester's Playground`].map((name, index) => ({ id: index + 1, name })),
    teams: [
      { id: 1, name: `MAGIC`, isMine: true }, { id: 2, name: `TT Admin Team`, isMine: true },
      { id: 3, name: `KRT Admin Team`, isMine: false }, { id: 4, name: `The Jester's Guild`, isMine: false }
    ],
    admins: [`MAGIC`, `Zarad`, `danilix`, `ABOHANI`, `nemo`, `Toyz7638`, `The Jester`].map((name, index): ActionEventsAdmin => ({
      id: userId + index, name, teamIds: [[1, 2], [1], [2, 3], [3], [4], [1, 4], [2, 3, 4]][index],
      avatarUrl: portrait(name, [`#6f477e`, `#386b8a`, `#9c7041`, `#617146`, `#7d3f46`, `#385b74`, `#684aa0`][index]),
      player: { id: 800 + index, name, playfabId: (800 + index).toString(16).padStart(16, `0`).toUpperCase(), canOpen: false }
    }))
  }
  const players = names.map((name, index) => ({ id: 1000 + index, name, playfabId: (6530099500000000n + BigInt(index)).toString(16).toUpperCase(), canOpen: false }))
  const serverAvatars = [portrait(`TT`, `#385b74`), portrait(`MAGIC`, `#6f477e`), undefined, portrait(`Jester`, `#684aa0`)]
  let lastAdvance = now()
  let nextId = count
  let step = 0
  const search = new Map<number, string>()

  function makeEvent(id: number, index: number, timestamp: number): ActionEvent {
    const automatic = index % 3 === 2
    const origin = index % 3 === 1 ? `discord` : `spellbook`
    const admin = automatic ? null : catalog.admins[index % catalog.admins.length]
    const teamId = admin ? admin.teamIds[index % admin.teamIds.length] : index % 4 + 1
    const status = statuses[index % statuses.length]
    const action = actions[index % actions.length]
    const serverTarget = action.commands.some(command => [`server_message`, `admin_message`].includes(command.commandType))
    const event: ActionEvent = {
      id, admin, ruleset: null,
      action, target: serverTarget ? { type: `server` } : { type: `player`, player: players[index % players.length] },
      team: catalog.teams.find(team => team.id === teamId)!, server: { ...catalog.servers[index % 4], avatarUrl: serverAvatars[index % 4], canOpen: false },
      origin, execution: automatic ? `automatic` : `manual`, status,
      requestedAt: new Date(timestamp).toISOString(), completedAt: [`completed`, `failed`].includes(status) ? new Date(timestamp + 2000).toISOString() : null,
      reason: serverTarget ? `` : reasons[index % reasons.length], canCancel: admin?.id === userId && [`pending`, `claimed`].includes(status)
    }
    search.set(id, `${actionEventsSearchText(event)} sample-${String(id).padStart(5, `0`)}`)
    return event
  }

  let events = Array.from({ length: count }, (_, index) => makeEvent(count - index, index, lastAdvance - 30_000 - index * 8000))

  function advance(): void {
    if (!simulate || now() - lastAdvance < 5000) return
    lastAdvance = now()
    step++
    events = events.map((event, index) => index < 50 && [`pending`, `claimed`, `submitting`].includes(event.status) && lastAdvance - Date.parse(event.requestedAt) > 20_000
      ? { ...event, status: `completed`, completedAt: new Date(lastAdvance).toISOString(), canCancel: false } : event)
    const next = makeEvent(++nextId, step, lastAdvance)
    events.unshift(next)
  }

  return {
    catalog,
    async list({ query, cursor, limit, signal }) {
      signal.throwIfAborted()
      if (!cursor) advance()
      const teamIds = actionEventsTeamIds(query.teams, catalog)
      const filtered = events.filter(event => matchesActionEvent(event, query, catalog, search.get(event.id), teamIds))
      const separator = cursor?.lastIndexOf(`:`) ?? -1
      const boundaryTime = cursor?.slice(0, separator) ?? ``
      const boundaryId = Number(cursor?.slice(separator + 1))
      if (cursor && (!Number.isFinite(Date.parse(boundaryTime)) || !Number.isSafeInteger(boundaryId))) throw new Error(`Could not load older events. Please try again.`)
      const older = cursor ? filtered.filter(event => event.requestedAt < boundaryTime || (event.requestedAt === boundaryTime && event.id < boundaryId)) : filtered
      const items = older.slice(0, limit)
      const last = items.at(-1)
      return { items, total: filtered.length, nextCursor: last && items.length < older.length ? `${last.requestedAt}:${last.id}` : null }
    },
    async cancel({ id, signal }) {
      signal.throwIfAborted()
      const event = events.find(event => event.id === id)
      if (!event?.canCancel || ![`pending`, `claimed`].includes(event.status)) throw new Error(`This request can no longer be cancelled.`)
      const cancelled: ActionEvent = { ...event, status: `cancelled`, canCancel: false, completedAt: new Date(now()).toISOString() }
      events = events.map(item => item.id === id ? cancelled : item)
      return cancelled
    }
  }
}
