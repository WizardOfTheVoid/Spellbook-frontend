import type { PlayerListQuery, PlayerSearchRequest } from '$lib/core'
import type { PlayerPage } from './playersApi'

export function createPlayerRosterRequest(
  load: (query: PlayerListQuery, request: PlayerSearchRequest) => Promise<PlayerPage>,
  cancel: (request: PlayerSearchRequest) => void
) {
  const scopeId = crypto.randomUUID()
  let current: { key: string, request: PlayerSearchRequest, pending: boolean, result: Promise<PlayerPage> } | undefined
  const reset = () => {
    if (current?.pending) cancel(current.request)
    current = undefined
  }
  return {
    reset,
    async read(include: string[], revision: number): Promise<PlayerPage> {
      if (!include.length) {
        reset()
        return { players: [], meta: { currentPage: 1, pageSize: 100, totalPages: 0, totalResults: 0, hasPrevious: false, hasNext: false } }
      }
      const key = JSON.stringify([include, revision])
      if (current?.key !== key) {
        reset()
        const request = { scopeId, requestId: crypto.randomUUID() }
        current = { key, request, pending: true, result: load({ include }, request) }
      }
      const entry = current
      try {
        const result = await entry.result
        if (current !== entry) throw new DOMException(`Roster superseded`, `AbortError`)
        return result
      } catch (error) {
        if (current === entry) current = undefined
        throw error
      } finally {
        entry.pending = false
      }
    }
  }
}
