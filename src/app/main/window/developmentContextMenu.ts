import type { BrowserWindow, Menu, MenuItemConstructorOptions } from 'electron'

type DevelopmentContextMenuOptions = {
  development: boolean
  buildMenu: (items: MenuItemConstructorOptions[]) => Pick<Menu, `popup`>
  copyText: (text: string) => void
}

export function installDevelopmentContextMenu(window: BrowserWindow, options: DevelopmentContextMenuOptions): void {
  if (!options.development) return
  const contents = window.webContents
  let shiftPressed = false
  let shiftRightClick = false
  let inspectClick = false

  contents.on(`before-input-event`, (_event, input) => {
    shiftPressed = input.shift && !(input.key === `Shift` && input.type === `keyUp`)
  })
  window.on(`blur`, () => {
    shiftPressed = false
    shiftRightClick = false
    inspectClick = false
  })
  contents.on(`before-mouse-event`, (event, input) => {
    if (input.type !== `mouseDown` && input.type !== `mouseUp`) return
    // Windows mouse callbacks omit modifier flags.
    const shifted = input.modifiers?.includes(`shift`) ?? shiftPressed
    shiftRightClick = input.button === `right` && shifted
    if (input.type === `mouseDown`) inspectClick = input.button === `left` && shifted
    if (!inspectClick || input.button !== `left`) return

    event.preventDefault()
    if (input.type === `mouseUp`) {
      inspectClick = false
      contents.inspectElement(input.x, input.y)
    }
  })

  contents.on(`context-menu`, (_event, params) => {
    const showMenu = shiftRightClick
    shiftRightClick = false
    if (!showMenu) return

    const items: MenuItemConstructorOptions[] = []
    const flags = params.editFlags
    if (params.isEditable) {
      items.push(
        { role: `undo`, enabled: flags.canUndo },
        { role: `redo`, enabled: flags.canRedo },
        { type: `separator` },
        { role: `cut`, enabled: flags.canCut },
        { role: `copy`, enabled: flags.canCopy },
        { role: `paste`, enabled: flags.canPaste },
        { role: `selectAll`, enabled: flags.canSelectAll }
      )
    } else if (flags.canCopy) {
      items.push({ role: `copy` })
    }
    if (params.linkURL) {
      items.push({ label: `Copy link address`, click: () => options.copyText(params.linkURL) })
    }
    if (params.mediaType === `image` && params.hasImageContents) {
      items.push({ label: `Copy image`, click: () => contents.copyImageAt(params.x, params.y) })
    }
    if (items.length) items.push({ type: `separator` })
    items.push(
      { role: `reload` },
      { label: `Inspect`, click: () => contents.inspectElement(params.x, params.y) }
    )
    options.buildMenu(items).popup({
      window,
      x: params.x,
      y: params.y,
      sourceType: params.menuSourceType,
      ...(params.frame ? { frame: params.frame } : {})
    })
  })
}
