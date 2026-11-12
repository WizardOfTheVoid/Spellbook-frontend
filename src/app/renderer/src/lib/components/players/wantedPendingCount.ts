import { writable } from 'svelte/store'
import { getWantedCandidates } from '$lib/utils/wantedCandidateApi'
import { ApiResultError } from '$lib/utils/apiResult'

export function createWantedPendingCount(load: () => Promise<{ meta: { totalResults: number | null } }>) {
  const state = writable<number | null>(null)
  let account: number | null = null
  let revision = 0
  let loading = false

  async function refresh(): Promise<void> {
    if (account === null || loading) return
    const current = revision
    loading = true
    try {
      const { meta } = await load()
      const count = meta.totalResults
      if (current === revision && typeof count === `number` && Number.isSafeInteger(count) && count >= 0) state.set(count)
    } catch (error) {
      if (current === revision && error instanceof ApiResultError && (error.status === 401 || error.status === 403)) state.set(null)
      // Keep the last known count until the next successful refresh.
    } finally {
      if (current === revision) loading = false
    }
  }

  function invalidate(): void {
    revision++
    loading = false
    void refresh()
  }

  function syncUser(userId: number | null, canReview = false): void {
    const next = canReview ? userId : null
    if (next === account) return
    account = next
    state.set(null)
    invalidate()
  }

  return { subscribe: state.subscribe, syncUser, refresh, invalidate }
}

export const wantedPendingCount = createWantedPendingCount(() => getWantedCandidates())
