import type { PlayerListMeta } from '../../utils/playersApi'

export type PlayerResultSnapshot<T> = {
  key: string
  players: T[]
  meta: PlayerListMeta | null
  error: string | null
  windowReached: boolean
}

export function createPlayerResultBatches<T extends { id: number }>() {
  let key = ``
  let players: T[] = []
  let positions = new Map<number, number>()
  let meta: PlayerListMeta | null = null
  let error: string | null = null
  let pending = false
  const windowReached = () => meta?.searchSource === `opensearch` && meta.currentPage >= 100
  const nextPage = () => !meta ? 1 : meta.hasNext && !windowReached() ? meta.currentPage + 1 : null

  return {
    reset(nextKey: string, saved?: PlayerResultSnapshot<T>): void {
      key = nextKey
      players = saved?.key === key ? [...saved.players] : []
      positions = new Map(players.map((player, index) => [player.id, index]))
      meta = saved?.key === key && saved.meta ? { ...saved.meta } : null
      error = null
      pending = false
    },
    nextPage,
    begin(candidate: string, retry = false): number | null {
      if (candidate !== key || pending || error && !retry) return null
      const page = nextPage()
      if (page === null) return null
      pending = true
      error = null
      return page
    },
    accept(candidate: string, page: { players: T[], meta: PlayerListMeta }): boolean {
      if (candidate !== key || !pending || page.meta.currentPage !== nextPage()) return false
      const merged = [...players]
      for (const player of page.players) {
        const position = positions.get(player.id)
        if (position === undefined) {
          positions.set(player.id, merged.length)
          merged.push(player)
        } else merged[position] = player
      }
      players = merged
      meta = { ...page.meta }
      error = null
      pending = false
      return true
    },
    fail(candidate: string, reason: string): boolean {
      if (candidate !== key) return false
      pending = false
      error = reason
      return true
    },
    cancel(): void { pending = false },
    snapshot(): PlayerResultSnapshot<T> {
      return { key, players, meta: meta ? { ...meta } : null, error, windowReached: Boolean(windowReached()) }
    }
  }
}
