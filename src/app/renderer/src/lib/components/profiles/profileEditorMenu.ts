import { openInfinityMenu } from '../ui/infinityMenu'

export function openProfileEditorMenu(event: MouseEvent, name: string, options: {
  editable: boolean
  canDelete: boolean
  onDuplicate: () => void
  onDelete: () => void
}): void {
  event.preventDefault()
  event.stopPropagation()
  openInfinityMenu({
    name, icon: `fa-layer-group`, items: [
      { name: `Duplicate`, icon: `fa-copy`, disabled: !options.editable, action: options.onDuplicate },
      { name: `Delete`, icon: `fa-trash`, disabled: !options.editable || !options.canDelete,
        tooltip: options.editable && !options.canDelete ? `An action needs at least one command.` : undefined,
        action: options.onDelete }
    ]
  }, { x: event.clientX, y: event.clientY }, event.currentTarget as HTMLElement | null)
}
