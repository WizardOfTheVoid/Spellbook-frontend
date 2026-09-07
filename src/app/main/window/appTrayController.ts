import type { Menu, MenuItemConstructorOptions, Tray } from 'electron'
import type { TrayDestination } from '../../shared/trayNavigation'
import { defaultKeybinds, keybindLabel, type ShortcutKeyCode } from '../../shared/keybinds'

type AppTrayControllerOptions = {
  appName: string
  iconPath: string
  getVersion: () => string
  createTray: (iconPath: string) => Tray
  buildMenu: (template: MenuItemConstructorOptions[]) => Menu
  onToggle: () => void
  onNavigate: (destination: TrayDestination) => void
  onError: (error: unknown) => void
}

export class AppTrayController {
  private tray: Tray | null = null
  private overlayKey = defaultKeybinds.overlayKey

  constructor(private readonly options: AppTrayControllerOptions) {}

  initialize(): void {
    if (this.tray) return

    let tray: Tray | null = null
    try {
      tray = this.options.createTray(this.options.iconPath)
      tray.on(`click`, () => this.options.onToggle())
      tray.setToolTip(this.options.appName)
      tray.setContextMenu(this.buildMenu())
      this.tray = tray
    } catch (error) {
      this.ignoreError(() => tray?.destroy())
      this.ignoreError(() => this.options.onError(error))
    }
  }

  refresh(overlayKey: ShortcutKeyCode): void {
    this.overlayKey = overlayKey
    if (this.tray) this.tray.setContextMenu(this.buildMenu())
  }

  private buildMenu(): Menu {
    return this.options.buildMenu([
        { label: `${this.options.appName} ${this.options.getVersion()}`, enabled: false },
        { type: `separator` },
        { label: `Profile`, click: () => this.options.onNavigate(`account`) },
        { label: `Settings`, click: () => this.options.onNavigate(`settings`) },
        { label: `My teams`, click: () => this.options.onNavigate(`teams`) },
        { label: `Help`, click: () => this.options.onNavigate(`help`) },
        { type: `separator` },
        { label: `Toggle (${keybindLabel(this.overlayKey)})`, click: () => this.options.onToggle() },
        { label: `Quit`, role: `quit` }
      ])
  }

  private ignoreError(action: () => void): void {
    try {
      action()
    } catch {}
  }

  cleanup(): void {
    const tray = this.tray
    this.tray = null
    tray?.destroy()
  }
}
