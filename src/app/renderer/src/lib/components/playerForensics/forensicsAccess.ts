import type { UserSession } from '../../core'

export function canOpenPlayerForensics(user: Pick<UserSession, `isSuperadmin`> | null | undefined): boolean {
  return user?.isSuperadmin === true
}
