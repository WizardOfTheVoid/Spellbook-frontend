import type {
  GameServerRecord,
  ProfileOwner,
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

export function buildProfileServerOptions(
  gameServers: readonly GameServerRecord[],
  assignments: readonly ProfileServerAssignment[],
  currentProfileId: number | null,
  owner?: ProfileOwner | null,
): FormOption[] {
  const sameScope = assignments.filter(assignment => !owner || !assignment.owner
    || (owner.type === `team` ? assignment.owner.type === `team`
      : assignment.owner.type === `user` && assignment.owner.id === owner.id))
  const assignedProfiles = new Map(sameScope.map(assignment => [assignment.gameServerId, assignment]))

  return gameServers.map((server) => {
    const assignment = assignedProfiles.get(server.id)
    const assignedElsewhere = assignment && assignment.profileId !== currentProfileId ? assignment : null

    return {
      value: server.id.toString(),
      label: getServerLabel(server),
      description: assignedElsewhere ? `Assigned to ${assignedElsewhere.profileName}` : server.name,
      disabled: Boolean(assignedElsewhere)
    }
  })
}

export function reconcileProfileServerAssignments(
  current: readonly ServerProfileServer[],
  eligibleServers: readonly GameServerRecord[],
  selectedIds: ReadonlySet<number>,
  owner: ProfileOwner,
  profileId: number
): ServerProfileServer[] {
  const eligibleIds = new Set(eligibleServers.map(({ id }) => id))
  const hiddenAssignments = current.filter(({ gameServerId }) => !eligibleIds.has(gameServerId))
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
