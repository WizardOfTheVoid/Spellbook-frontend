import { writable } from 'svelte/store'
import { actionsApi } from '$lib/utils/actionsApi'
export const timezone = writable(`UTC`)
export async function loadTimezone() {
  const settings = await actionsApi<{ timezone?: string }>(`userSettings`)
  timezone.set(settings.timezone ?? `UTC`)
}
export async function saveTimezone(value: string) {
  await actionsApi(`saveUserSettings`, { timezone: value })
  timezone.set(value)
}
export function formatActionTime(value: string, zone: string) {
  return new Intl.DateTimeFormat(undefined, { timeZone: zone, dateStyle: `medium`, timeStyle: `short` }).format(new Date(value))
}
