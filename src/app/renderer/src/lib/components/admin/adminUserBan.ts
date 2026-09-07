import type { AdminUserRecord, CoreCallResult, UserSession } from '$lib/core'
import { unwrap } from '$lib/utils/apiResult'
import { openInfinityMenu } from '../ui/infinityMenu'

type Actor = Pick<UserSession, `id` | `isActive` | `isSuperadmin`> | null
type BanRequest = (userId: number, reason: string) => Promise<CoreCallResult>

export async function loadAdminUserBan(userId: number, getUser: (userId: number) => Promise<CoreCallResult>): Promise<{ user: AdminUserRecord, reason: string }> {
  const user = await unwrap<AdminUserRecord>(await getUser(userId), `User details could not be loaded.`)
  return { user, reason: user.banReason ?? `` }
}

export function canBanAdminUser(actor: Actor, user: AdminUserRecord): boolean {
  return Boolean(actor?.isActive && actor.isSuperadmin && actor.id !== user.id && !user.bannedAt)
}

export async function banAdminUser(actor: Actor, user: AdminUserRecord, reason: string, ban: BanRequest): Promise<void> {
  if (!canBanAdminUser(actor, user)) throw new Error(`You cannot ban this account.`)
  const trimmed = reason.trim()
  if (!trimmed || trimmed.length > 500) throw new Error(`Enter a reason between 1 and 500 characters.`)
  await unwrap<unknown>(await ban(user.id, trimmed), `User ban failed.`)
}

export function openAdminUserMenu(event: MouseEvent, target: {
  actor: Actor
  user: AdminUserRecord
  onOpenUser: (userId: number) => void
  onBan: (user: AdminUserRecord) => void
}): void {
  event.preventDefault()
  event.stopPropagation()
  openInfinityMenu({
    name: target.user.displayName,
    icon: `fa-user`,
    items: [
      { name: `Open profile`, icon: `fa-user`, action: () => target.onOpenUser(target.user.id) },
      {
        name: `Ban user`, icon: `fa-ban`,
        disabled: !canBanAdminUser(target.actor, target.user),
        action: () => target.onBan(target.user)
      }
    ]
  }, { x: event.clientX, y: event.clientY }, event.currentTarget as HTMLElement | null)
}
