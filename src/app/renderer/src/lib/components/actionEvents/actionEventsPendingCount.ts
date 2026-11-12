import { writable } from 'svelte/store'
import { createActionEventsQuery, type ActionEventsPage } from '@spellbook/shared/actionEvents'
import { actionsApi } from '$lib/utils/actionsApi'

export function createActionEventsPendingCount(load: () => Promise<number>) {
  const state = writable<number | null>(null)
  let account: string | null = null
  let revision = 0
  let loading = false

  async function refresh(): Promise<void> {
    if (account === null || loading) return
    const current = revision
    loading = true
    try {
      const count = await load()
      if (current === revision && Number.isSafeInteger(count) && count >= 0) state.set(count)
    } catch {
      // Keep the last count until the next refresh succeeds.
    } finally {
      if (current === revision) loading = false
    }
  }

  function syncUser(userId: number | null, superadmin = false): void {
    const next = userId === null ? null : `${userId}:${superadmin}`
    if (next === account) return
    account = next
    revision++
    loading = false
    state.set(null)
    void refresh()
  }

  return { subscribe: state.subscribe, syncUser, refresh }
}

export const actionEventsPendingCount = createActionEventsPendingCount(async () => {
  const page = await actionsApi<ActionEventsPage>(`events`, {
    query: JSON.stringify(createActionEventsQuery({ status: `pending` })), limit: 1
  })
  return page.total ?? 0
})
