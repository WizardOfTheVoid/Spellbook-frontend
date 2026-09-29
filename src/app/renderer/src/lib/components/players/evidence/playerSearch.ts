import type { DbPlayerListItem } from '$lib/core'
import { createLatestRequestTracker, createQueryDebouncer } from '$lib/utils/archiveRequests'

export type EvidencePlayerSearchState = {
  players: DbPlayerListItem[]
  searching: boolean
  error: string | null
}

export function createEvidencePlayerSearch(
  load: (search: string) => Promise<DbPlayerListItem[]>,
  onChange: (state: EvidencePlayerSearchState) => void,
) {
  let state: EvidencePlayerSearchState = { players: [], searching: false, error: null }
  const publish = (next: Partial<EvidencePlayerSearchState>) => {
    state = { ...state, ...next }
    onChange(state)
  }
  const requests = createLatestRequestTracker(searching => publish({ searching }))
  const debounce = createQueryDebouncer<string>(query => void search(query), 250)

  function cancel(): void {
    debounce.cancel()
    requests.cancel()
    publish({ players: [], error: null })
  }

  async function search(query: string): Promise<void> {
    const version = requests.start()
    try {
      const players = await load(query)
      if (requests.isCurrent(version)) publish({ players })
    } catch (cause) {
      if (requests.isCurrent(version)) publish({ error: cause instanceof Error ? cause.message : `Players could not be loaded.` })
    } finally { requests.settle(version) }
  }

  return {
    update(value: string): void {
      cancel()
      const query = value.trim()
      if (query) debounce.schedule(query)
    },
    cancel
  }
}
