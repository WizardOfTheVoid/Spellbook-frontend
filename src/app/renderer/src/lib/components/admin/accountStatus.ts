import type { AdminUserRecord } from '$lib/core'

export type AccountStatus = `enabled` | `awaitingApproval` | `suspended`

export function accountStatus(user: Pick<AdminUserRecord, `isActive` | `bannedAt`>): AccountStatus {
  if (user.bannedAt) return `suspended`
  return user.isActive ? `enabled` : `awaitingApproval`
}

export function accountStatusLabel(status: AccountStatus): string {
  if (status === `enabled`) return `Enabled`
  if (status === `suspended`) return `Suspended`
  return `Awaiting approval`
}
