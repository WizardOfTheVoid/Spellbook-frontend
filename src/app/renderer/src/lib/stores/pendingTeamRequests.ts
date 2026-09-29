import { writable } from 'svelte/store'
import { getServerApi } from '$lib/core'
import { unwrap } from '$lib/utils/apiResult'

type Scheduler = {
  setInterval(run: () => void, milliseconds: number): number
  clearInterval(id: number): void
}

export function createPendingTeamRequests(fetchCount: () => Promise<number>, scheduler: Scheduler) {
  const state = writable(0)
  let userId: number | null = null
  let request = 0
  let loading = false
  let timer: number | null = null

  async function refresh(): Promise<void> {
    if (userId === null) return
    const current = ++request
    loading = true
    try {
      const count = await fetchCount()
      if (current === request && Number.isInteger(count) && count >= 0) state.set(count)
    } catch {
      // Keep the last count during a transient outage; the next poll retries.
    } finally {
      if (current === request) loading = false
    }
  }

  function syncUser(nextUserId: number | null): void {
    if (nextUserId === userId) return
    request += 1
    userId = nextUserId
    loading = false
    state.set(0)
    if (timer !== null) scheduler.clearInterval(timer)
    timer = null
    if (userId === null) return
    timer = scheduler.setInterval(() => { if (!loading) void refresh() }, 8000)
    void refresh()
  }

  return { subscribe: state.subscribe, syncUser, refresh }
}

export const pendingTeamRequests = createPendingTeamRequests(async () => {
  const result = await unwrap<{ count: number }>(
    await getServerApi().teams.pendingRequestCount(), `Pending requests could not be loaded.`)
  return result.count
}, {
  setInterval: (run, milliseconds) => window.setInterval(run, milliseconds),
  clearInterval: id => window.clearInterval(id)
})
