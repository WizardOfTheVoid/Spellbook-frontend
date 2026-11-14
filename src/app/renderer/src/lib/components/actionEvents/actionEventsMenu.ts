import type { InfinityMenuLevel } from '../ui/infinityMenu'
import type { ActionEvent, ActionEventsPlayer } from './actionEventsTypes'
import { profileActionIcon } from '../../utils/profileActions'

export type ActionEventsMenuActions = {
  onCancel: (id: number) => void
  onOpenPlayer: (player: ActionEventsPlayer) => void
  onOpenServer: (id: number) => void
}

export function createActionEventsMenu(event: ActionEvent, busy: boolean, actions: ActionEventsMenuActions): InfinityMenuLevel {
  const player = event.target.type === `player` ? event.target.player : null
  const adminPlayer = event.admin?.player
  return {
    name: `Action event`, icon: profileActionIcon(event.action).name,
    items: [
      { name: busy ? `Cancelling…` : `Cancel request`, icon: `fa-xmark`, disabled: busy || !event.canCancel || ![`pending`, `claimed`].includes(event.status), action: () => actions.onCancel(event.id) },
      ...(player ? [{ name: `Open target player profile`, icon: `fa-user`, disabled: !player.canOpen, action: () => actions.onOpenPlayer(player) }] : []),
      ...(adminPlayer ? [{ name: `Open admin player profile`, icon: `fa-user-shield`, disabled: !adminPlayer.canOpen, action: () => actions.onOpenPlayer(adminPlayer) }] : []),
      { name: `Open server profile`, icon: `fa-server`, disabled: !event.server.canOpen, action: () => actions.onOpenServer(event.server.id) }
    ]
  }
}
