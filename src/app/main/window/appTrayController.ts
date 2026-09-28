import type { Menu, MenuItemConstructorOptions, Tray } from 'electron'
import type { TrayDestination } from '../../shared/trayNavigation'
import type { Chivalry2Edition } from '../gameInstallations/chivalry2InstallationService'
import { defaultKeybinds, keybindLabel, type ShortcutKeyCode } from '../../shared/keybinds'

type AppTrayControllerOptions = {
  appName: string
  iconPath: string
  getVersion: () => string
  getInstalledEditions: () => Promise<Chivalry2Edition[]>
  createTray: (iconPath: string) => Tray
  buildMenu: (template: MenuItemConstructorOptions[]) => Menu
  onToggle: () => void
  onNavigate: (destination: TrayDestination) => void
  onError: (error: unknown) => void
}

export class AppTrayController {
  private tray: Tray | null = null
  private overlayKey = defaultKeybinds.overlayKey
  private installedEditions: Chivalry2Edition[] = []

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
      void this.refreshInstallations()
    } catch (error) {
      this.ignoreError(() => tray?.destroy())
      this.ignoreError(() => this.options.onError(error))
    }
  }

  refresh(overlayKey: ShortcutKeyCode): void {
    this.overlayKey = overlayKey
    if (this.tray) this.tray.setContextMenu(this.buildMenu())
  }

  async refreshInstallations(): Promise<void> {
    const tray = this.tray
    if (!tray) return
    try {
      const detected = await this.options.getInstalledEditions()
      if (this.tray !== tray) return
      const editions = ([`Epic`, `Steam`] as const).filter(edition => detected.includes(edition))
      if (editions.join() === this.installedEditions.join()) return
      this.installedEditions = editions
      tray.setContextMenu(this.buildMenu())
    } catch (error) {
      if (this.tray === tray) this.ignoreError(() => this.options.onError(error))
    }
  }

  private buildMenu(): Menu {
    return this.options.buildMenu([
        { label: `${this.options.appName} ${this.options.getVersion()}`, enabled: false },
        { type: `separator` },
        ...this.installedEditions.map(edition => ({
          id: `chivalry2:${edition}`,
          label: `Chivalry 2: ${edition}`,
          enabled: false
        })),
        ...(this.installedEditions.length ? [{ type: `separator` as const }] : []),
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
    this.installedEditions = []
    tray?.destroy()
  }
}
