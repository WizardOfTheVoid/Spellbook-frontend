import type { BrowserWindow } from 'electron'
import type { AntiAfkStatusWindowFactory } from './anti-afk-status-window-factory'

export class AntiAfkStatusWindowController {
  private window: BrowserWindow | null = null

  constructor(private readonly factory: AntiAfkStatusWindowFactory) {}

  show(): void {
    const window = this.getOrCreate()
    window.setBounds(this.factory.getTargetBounds())
    if (!window.isVisible()) window.showInactive()
    window.setAlwaysOnTop(true, `screen-saver`)
  }

  hide(): void {
    if (this.window && !this.window.isDestroyed() && this.window.isVisible()) {
      this.window.hide()
    }
  }

  private getOrCreate(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window

    const window = this.factory.createWindow()
    window.on(`closed`, () => {
      this.window = null
    })
    this.factory.loadContent(window)
    this.window = window
    return window
  }
}
