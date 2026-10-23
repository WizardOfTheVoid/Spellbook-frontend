import { get, writable } from 'svelte/store'
import type { NotificationRecord } from '@spellbook/shared/notifications'
import type { ActionRun } from '@spellbook/shared/actions/actionTypes'
import { actionsApi } from '$lib/utils/actionsApi'
import { notifyError, notifySuccess, notifyWarning } from './notificationEvents'

export const clickedRequestCancels = writable<Set<number>>(new Set())

export function requestCancelId(notification: Pick<NotificationRecord, `source` | `callback`>): number | null {
  const match = /^\/requests\/([1-9]\d*)\/cancel$/u.exec(notification.callback?.uri ?? ``)
  const id = Number(match?.[1])
  return notification.source === `action-request` && match && Number.isSafeInteger(id) ? id : null
}

export async function cancelNotificationRequest(notification: Pick<NotificationRecord, `source` | `callback`>): Promise<boolean> {
  const id = requestCancelId(notification)
  if (id === null) return false
  if (get(clickedRequestCancels).has(id)) return true
  clickedRequestCancels.update(ids => new Set(ids).add(id))
  try {
    const result = await actionsApi<ActionRun>(`cancel`, { id })
    if (result.status === `cancelled`) notifySuccess(`Action request cancelled.`)
    else notifyWarning(`Request is ${result.status}. It is too late to cancel.`)
  } catch (error) { notifyError(error instanceof Error ? error.message : `Request could not be cancelled.`) }
  return true
}
