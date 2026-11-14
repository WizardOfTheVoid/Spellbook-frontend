import type { GameServerRecord } from '$lib/core'
import { getServerLabel } from '$lib/utils/displayNames'
import { openInfinityMenu } from '../ui/infinityMenu'

export type ServerInfinityMenuTarget = {
  server: GameServerRecord
  isSuperadmin: boolean
  busy: boolean
  onEdit: (server: GameServerRecord) => void
  onDelete: (server: GameServerRecord) => void
  onRestore: (server: GameServerRecord) => void
}

export function openServerInfinityMenu(event: MouseEvent, target: ServerInfinityMenuTarget): void {
  event.preventDefault()
  event.stopPropagation()

  const deleted = Boolean(target.server.deletedAt)

  openInfinityMenu({
    name: getServerLabel(target.server),
    icon: 'fa-server',
    placement: event.type === `contextmenu` ? undefined : `bottom`,
    items: [
      {
        name: `Open`,
        icon: `fa-arrow-up-right-from-square`,
        disabled: target.busy,
        action: () => target.onEdit(target.server)
      },
      ...(target.isSuperadmin ? [{
        name: deleted ? 'Restore' : 'Delete',
        icon: deleted ? 'fa-rotate-left' : 'fa-trash',
        disabled: target.busy,
        action: () => deleted ? target.onRestore(target.server) : target.onDelete(target.server)
      }] : [])
    ]
  }, {
    x: event.clientX,
    y: event.clientY
  }, event.currentTarget as HTMLElement | null)
}
