import type { Menu, MenuItemConstructorOptions, Tray } from 'electron'
import type { TrayDestination } from '../../shared/trayNavigation'

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

  constructor(private readonly options: AppTrayControllerOptions) {}

  initialize(): void {
    if (this.tray) return

    let tray: Tray | null = null
    try {
      tray = this.options.createTray(this.options.iconPath)
      tray.on(`click`, () => this.options.onToggle())
      const menu = this.options.buildMenu([
        { label: `${this.options.appName} ${this.options.getVersion()}`, enabled: false },
        { type: `separator` },
        { label: `Profile`, click: () => this.options.onNavigate(`account`) },
        { label: `Settings`, click: () => this.options.onNavigate(`settings`) },
        { label: `My teams`, click: () => this.options.onNavigate(`teams`) },
        { label: `Help`, click: () => this.options.onNavigate(`help`) },
        { type: `separator` },
        { label: `Toggle (F3)`, click: () => this.options.onToggle() }
      ])
      tray.setToolTip(this.options.appName)
      tray.setContextMenu(menu)
      this.tray = tray
    } catch (error) {
      this.ignoreError(() => tray?.destroy())
      this.ignoreError(() => this.options.onError(error))
    }
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
