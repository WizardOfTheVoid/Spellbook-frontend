import type { TeamMemberRecord } from '../../../core'

export function filterInviteCandidates(users: readonly TeamMemberRecord[], search: string): TeamMemberRecord[] {
  const term = search.trim().replace(/^@/u, ``).toLocaleLowerCase()
  return users.filter(user => !term || [user.displayName, user.username, user.playfabId].some(value => value?.toLocaleLowerCase().includes(term)))
}
