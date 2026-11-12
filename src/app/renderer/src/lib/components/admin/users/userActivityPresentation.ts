import type { AuditLogRecord } from '../../../core'

const descriptions: Record<string, string> = {
  'player_note.created': `Added a player note`, 'player_note.updated': `Updated a player note`, 'player_note.deleted': `Removed a player note`,
  'player_action.created': `Created a player action`, 'player.action_created': `Recorded a player action`,
  'player_action.repeated': `Repeated a player action`, 'player_action.removed': `Removed a player action`,
  'wanted.created': `Added a Wanted entry`, 'wanted.removed': `Removed a Wanted entry`,
  'team.member-joined': `Added a team member`, 'team.member-left': `Updated team membership`,
  'team.renamed': `Renamed a team`, 'team.ownership-transferred': `Transferred team ownership`, 'team.deleted': `Deleted a team`,
  'team.servers-updated': `Updated team servers`, 'team.settings-updated': `Updated team settings`, 'team.guidelines-updated': `Updated team guidelines`,
  'user.wanted_permission_changed': `Changed Wanted creation permission`, 'user.release_permission_changed': `Changed Release creation permission`,
  'user.account_access_changed': `Changed account access`, 'action_request.cancelled': `Cancelled an action request`,
  'action.control': `Updated an action`, 'definition.tag-type.updated': `Updated a tag type`
}
const targets: Record<string, string> = { player: `Player`, team: `Team`, user: `User`, action: `Action`, server_profile: `Profile`, game_server: `Server` }
const outcomes: Record<string, string> = { submitted: `Submitted`, pending: `Pending`, failed: `Failed`, failure: `Failed`, cancelled: `Cancelled`, denied: `Denied` }

export function userActivityPresentation(record: AuditLogRecord): { description: string, target: string, outcome: string, createdAt: string } {
  return { description: descriptions[record.eventType] ?? `Recorded activity`, target: `${targets[record.targetType] ?? `Item`} #${record.targetId}`,
    outcome: outcomes[record.outcome] ?? `Recorded`, createdAt: record.createdAt }
}
