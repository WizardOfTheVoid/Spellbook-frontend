import type { UserSession } from '../../core'

export function canOpenContent(user: Pick<UserSession, `isActive` | `isSuperadmin` | `releaseCreationEnabled`> | null | undefined): boolean {
  return user?.isActive === true && (user.isSuperadmin === true || user.releaseCreationEnabled === true)
}
