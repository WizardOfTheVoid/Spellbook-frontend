import type { ActionEvent, ActionEventsCatalog, ActionEventsPage, ActionEventsSource } from './actionEventsTypes'

type ActionsApi = <T>(operation: string, input?: unknown) => Promise<T>

export function createActionEventsApiSource(api: ActionsApi, onCatalog: (catalog: ActionEventsCatalog) => void = () => {}): ActionEventsSource {
  const catalog: ActionEventsCatalog = { teams: [], admins: [], servers: [] }
  let initialized = false
  return {
    catalog,
    async list({ query, cursor, limit, signal }): Promise<ActionEventsPage> {
      signal.throwIfAborted()
      if (!initialized || !cursor) {
        const filters = await api<ActionEventsCatalog>(`eventFilters`)
        signal.throwIfAborted()
        Object.assign(catalog, filters)
        initialized = true
        onCatalog(catalog)
        signal.throwIfAborted()
      }
      const page = await api<ActionEventsPage>(`events`, { query: JSON.stringify(query), ...(cursor ? { cursor } : {}), limit })
      signal.throwIfAborted()
      return page
    },
    async cancel({ id, signal }): Promise<ActionEvent> {
      signal.throwIfAborted()
      const event = await api<ActionEvent>(`cancelEvent`, { id })
      signal.throwIfAborted()
      return event
    }
  }
}
