import type { BrowserWindow, Rectangle } from 'electron'
import type { GameActivitySnapshot } from '../../shared/gameActivity'

type DebugWindowFactory = {
  createWindow(): BrowserWindow
  loadContent(window: BrowserWindow): void
  getTargetBounds(): Rectangle
}

export class DebugWindowController {
  private window: BrowserWindow | null = null
  private overlay: BrowserWindow | null = null
  private activity: GameActivitySnapshot | null = null

  constructor(private readonly factory: DebugWindowFactory) {}

  bindOverlay(overlay: BrowserWindow): void {
    this.overlay = overlay
    overlay.on(`show`, () => this.raiseOverlay())
    overlay.on(`move`, () => this.refreshBounds())
    overlay.on(`resize`, () => this.refreshBounds())
  }

  setEnabled(enabled: boolean): void {
    if (!enabled) {
      if (this.window && !this.window.isDestroyed()) this.window.hide()
      return
    }
    const window = this.getOrCreate()
    this.refreshBounds()
    if (!window.isVisible()) window.showInactive()
  }

  update(activity: GameActivitySnapshot | null): void {
    this.activity = activity
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send(`debug:activity`, activity)
  }

  private refreshBounds(): void {
    if (!this.window || this.window.isDestroyed()) return
    this.window.setBounds(this.factory.getTargetBounds())
    this.raiseOverlay()
  }

  private raiseOverlay(): void {
    if (this.window?.isVisible() && this.overlay && !this.overlay.isDestroyed() && this.overlay.isVisible()) {
      this.overlay.moveTop()
    }
  }

  private getOrCreate(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window
    const window = this.factory.createWindow()
    this.window = window
    window.on(`closed`, () => { this.window = null })
    window.on(`show`, () => this.raiseOverlay())
    window.webContents.on(`did-finish-load`, () => this.update(this.activity))
    this.factory.loadContent(window)
    return window
  }
}
