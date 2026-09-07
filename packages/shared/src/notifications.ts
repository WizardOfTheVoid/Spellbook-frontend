export const notificationTones = [`success`, `error`, `warning`, `custom`] as const
export const notificationPageSize = 30
export type NotificationTone = typeof notificationTones[number]
export const adminNotificationAudiences = [`everyone`, `users`, `teams`] as const
export type AdminNotificationAudience = typeof adminNotificationAudiences[number]
export type AdminNotificationInput = {
  title: string
  description: string
} & ({ audience: `everyone`, recipientIds?: never } | { audience: `users` | `teams`, recipientIds: number[] })
export type AdminNotificationResult = { recipientCount: number }
export const adminCustomNotificationSource = `admin-custom-notification`
export const wantedExecutionNotificationSource = `wanted-execution`

export type NotificationCallback = { label: string, uri: `/${string}` }
export type NotificationRecord = {
  id: number
  userId: number
  tone: NotificationTone
  title: string
  description: string | null
  icon: string | null
  source: string
  content: Record<string, unknown>
  meta: Record<string, unknown>
  callback: NotificationCallback | null
  readAt: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}
export type NotificationCounts = {
  unreadCount: number
  totalCount: number
}

export type NotificationPage = NotificationCounts & {
  notifications: NotificationRecord[]
  nextAfterId: number
}

export type NotificationMutation = NotificationCounts & {
  notification: NotificationRecord
}

export type NotificationCreateInput = {
  userId: number
  tone: NotificationTone
  title: string
  description?: string | null
  icon?: string | null
  source: string
  content?: Record<string, unknown>
  meta?: Record<string, unknown>
  callback?: NotificationCallback | null
}
