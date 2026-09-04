import type { Menu, MenuItemConstructorOptions, Tray } from 'electron'

type AppTrayControllerOptions = {
  appName: string
  iconPath: string
  getVersion: () => string
  createTray: (iconPath: string) => Tray
  buildMenu: (template: MenuItemConstructorOptions[]) => Menu
  onToggle: () => void
  onExit: () => void
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
      const menu = this.options.buildMenu([
        { label: `${this.options.appName} ${this.options.getVersion()}`, enabled: false },
        { type: `separator` },
        { label: `Toggle`, click: () => this.options.onToggle() },
        { type: `separator` },
        { label: `Exit`, click: () => this.options.onExit() }
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
