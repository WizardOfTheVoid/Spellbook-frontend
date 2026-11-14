import { writable } from 'svelte/store'
import type { GameServerListPage, GameServerListQueryInput, GameServerRecord } from '../../../../core'
import { parseTelemetryEndpoint } from './telemetryEndpoint'

export type TelemetryServerTarget = { id: number, name: string, address: string }

export function telemetryServerTarget(server: GameServerRecord): TelemetryServerTarget | null {
  const address = `${server.host}:${server.port}`
  return !server.deletedAt && parseTelemetryEndpoint(address)
    ? { id: server.id, name: server.displayName?.trim() || server.name, address } : null
}

export class TelemetryServerSearch {
  readonly view = writable({
    targets: [] as TelemetryServerTarget[], page: 1, totalPages: 1,
    hasPrevious: false, hasNext: false, loading: false, error: null as string | null
  })
  private generation = 0

  constructor(private readonly query: (query: GameServerListQueryInput) => Promise<GameServerListPage>) {}

  async load(search: string, page: number) {
    const generation = ++this.generation
    this.view.update(state => ({ ...state, loading: true, error: null }))
    try {
      const result = await this.query({ search, page, deleted: `active`, includeMainMenu: false, sortBy: `alphabetical`, sortOrder: `asc` })
      if (generation !== this.generation) return
      this.view.set({
        targets: result.servers.flatMap(server => {
          const target = telemetryServerTarget(server)
          return target ? [target] : []
        }),
        page: result.meta.currentPage, totalPages: result.meta.totalPages,
        hasPrevious: result.meta.hasPrevious, hasNext: result.meta.hasNext, loading: false, error: null
      })
    } catch (error) {
      if (generation === this.generation) this.view.update(state => ({
        ...state, loading: false, error: error instanceof Error ? error.message : `Server search failed`
      }))
    }
  }

  dispose() { this.generation++ }
}
