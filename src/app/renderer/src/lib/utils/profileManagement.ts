import type {
  GameServerRecord,
  ProfileOwner,
  ServerProfileOwner,
  ServerProfileServer
} from '$lib/core'
import type { FormOption } from '$lib/types/ui'
import { getServerLabel } from './displayNames'

type ProfileServerAssignment = {
  owner?: ProfileOwner
  gameServerId: number
  profileId: number
  profileName: string
}

export function eligibleProfileServers(gameServers: readonly GameServerRecord[], owner?: ProfileOwner | null, memberTeamIds: readonly number[] = []): GameServerRecord[] {
  return gameServers.filter(server => owner?.type === `team`
    ? server.ownerTeamId === owner.id
    : owner?.type === `user`
      ? server.ownerTeamId !== null && memberTeamIds.includes(server.ownerTeamId)
      : true)
}

export function canTransferProfileOwner(owner: ServerProfileOwner, target: ProfileOwner, attachmentCount: number): boolean {
  if (owner.type === `system`) return false
  return (owner.type === target.type && owner.id === target.id)
    || attachmentCount === 0 || (owner.type === `user` && target.type === `user`)
}

export function buildProfileServerOptions(
  gameServers: readonly GameServerRecord[],
  assignments: readonly ProfileServerAssignment[],
  currentProfileId: number | null,
  owner?: ProfileOwner | null,
  memberTeamIds: readonly number[] = [],
  current: readonly ServerProfileServer[] = [],
): FormOption[] {
  const sameScope = assignments.filter(assignment => !owner || !assignment.owner
    || (owner.type === `team` ? assignment.owner.type === `team`
      : assignment.owner.type === `user` && assignment.owner.id === owner.id))
  const assignedProfiles = new Map(sameScope.map(assignment => [assignment.gameServerId, assignment]))

  const eligible = eligibleProfileServers(gameServers, owner, memberTeamIds)
  const options = eligible.map((server) => {
    const assignment = assignedProfiles.get(server.id)
    const assignedElsewhere = assignment && assignment.profileId !== currentProfileId ? assignment : null

    return {
      value: server.id.toString(),
      label: getServerLabel(server),
      description: assignedElsewhere ? `Assigned to ${assignedElsewhere.profileName}` : getServerLabel(server),
      disabled: Boolean(assignedElsewhere) && !current.some(item => item.gameServerId === server.id)
    }
  })
  return [...options, ...current.filter(server => !eligible.some(item => item.id === server.gameServerId)).map(server => ({
    value: String(server.gameServerId),
    label: server.gameServerName || `Server ${server.gameServerId}`,
    description: `Unavailable for new attachments`,
    disabled: false
  }))]
}

export function reconcileProfileServerAssignments(
  current: readonly ServerProfileServer[],
  eligibleServers: readonly GameServerRecord[],
  selectedIds: ReadonlySet<number>,
  owner: ProfileOwner,
  profileId: number
): ServerProfileServer[] {
  const eligibleIds = new Set(eligibleServers.map(({ id }) => id))
  const hiddenAssignments = current.filter(({ gameServerId }) => !eligibleIds.has(gameServerId) && selectedIds.has(gameServerId))
  const selectedAssignments = eligibleServers
    .filter(({ id }) => selectedIds.has(id))
    .map((server) => ({
      id: current.find(({ gameServerId }) => gameServerId === server.id)?.id ?? 0,
      owner,
      profileId,
      gameServerId: server.id,
      gameServerName: server.name
    }))

  return [...hiddenAssignments, ...selectedAssignments]
}
