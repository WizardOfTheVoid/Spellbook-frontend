export function installDevelopmentContextMenu(
  target: Window,
  development: boolean,
  closeMenu: () => void
): () => void {
  if (!development) return () => {}

  const onContextMenu = (event: MouseEvent) => {
    if (!event.shiftKey || event.button !== 2) return
    event.stopImmediatePropagation()
    closeMenu()
  }

  target.addEventListener(`contextmenu`, onContextMenu, { capture: true })
  return () => target.removeEventListener(`contextmenu`, onContextMenu, { capture: true })
}
