import { getServerApi } from '$lib/core'
import { unwrap } from './apiResult'

export async function actionsApi<T>(operation: string, input?: unknown): Promise<T> {
  return unwrap<T>(await getServerApi().actions(operation, input), `Action request failed.`)
}
