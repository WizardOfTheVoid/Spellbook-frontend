import type { GameServerPlayers } from '../core'
import type { PlayerPresence } from '@spellbook/shared/playerPresence'
import { expireSummary } from './liveSummary'

type Dependencies = { roster(id: number): Promise<GameServerPlayers>, presence(ids: number[]): Promise<Record<number, PlayerPresence>>, now?: () => number }
type CachedRoster = { data: GameServerPlayers, receivedAt: number }

export class ServerStoreCache {
  private scope = ``
  private generation = 0
  private epoch: string | null = null
  private readonly rosters = new Map<number, CachedRoster>()
  private readonly pending = new Map<string, Promise<unknown>>()
  private readonly listeners = new Set<(id: number | null, data: GameServerPlayers | null) => void>()
  private readonly now: () => number

  constructor(private readonly api: Dependencies) { this.now = api.now ?? Date.now }

  sync(scope: string) {
    if (this.scope === scope) return
    this.scope = scope
    this.clear()
  }

  clear() {
    this.generation++
    this.epoch = null
    this.rosters.clear()
    this.pending.clear()
    for (const listener of this.listeners) listener(null, null)
  }

  invalidate(id: number) {
    this.generation++
    this.rosters.delete(id)
    this.pending.clear()
    for (const listener of this.listeners) listener(id, null)
  }

  subscribe(listener: (id: number | null, data: GameServerPlayers | null) => void) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  peek(id: number): GameServerPlayers | null {
    const cached = this.rosters.get(id)
    return cached ? expireRoster(cached.data, cached.receivedAt, this.now()) : null
  }

  async roster(id: number, force = false): Promise<GameServerPlayers> {
    const startedGeneration = this.generation
    if (force) await this.pending.get(`roster:${id}`)?.catch(() => undefined)
    if (startedGeneration !== this.generation) throw new Error(`Live read was superseded.`)
    const cached = this.rosters.get(id)
    if (!force && cached && this.now() - cached.receivedAt < 4000) return this.peek(id)!
    return this.coalesce(`roster:${id}`, async () => {
      const generation = this.generation
      try {
        const data = await this.api.roster(id)
        if (generation !== this.generation) throw new Error(`Live read was superseded.`)
        if (this.epoch && this.epoch !== data.roster.epoch) this.clear()
        this.epoch = data.roster.epoch
        this.rosters.set(id, { data, receivedAt: this.now() })
        for (const listener of this.listeners) listener(id, data)
        return this.peek(id)!
      } catch (error) {
        if (generation === this.generation) {
          this.rosters.delete(id)
          for (const listener of this.listeners) listener(id, null)
        }
        throw error
      }
    })
  }

  async presence(ids: number[]): Promise<Record<number, PlayerPresence>> {
    const unique = [...new Set(ids)].sort((a, b) => a - b)
    if (!unique.length) return {}
    if (unique.length > 100) throw new Error(`At most 100 player IDs are allowed.`)
    const generation = this.generation
    return this.coalesce(`presence:${unique.join(`,`)}`, async () => {
      const result = await this.api.presence(unique)
      if (generation !== this.generation) throw new Error(`Presence read was superseded.`)
      return result
    })
  }

  private async coalesce<T>(key: string, read: () => Promise<T>): Promise<T> {
    const existing = this.pending.get(key)
    if (existing) return existing as Promise<T>
    const request = read()
    this.pending.set(key, request)
    try { return await request }
    finally { if (this.pending.get(key) === request) this.pending.delete(key) }
  }
}

export function expireRoster(data: GameServerPlayers, receivedAt: number, now: number): GameServerPlayers {
  const roster = data.roster
  const { sources, population } = expireSummary(roster, receivedAt, now)
  const status = roster.source && sources[roster.source].fresh ? `fresh` : roster.status === `unavailable` ? `unavailable` : `stale`
  return { ...data, roster: { ...roster, sources, status, population,
    bots: sources.a2s.fresh ? roster.bots : [],
    players: roster.players.map(player => ({ ...player, ...(status !== `fresh` || !sources.a2s.fresh ? { durationSeconds: null, durationObservedAt: null } : {}) })) } }
}
