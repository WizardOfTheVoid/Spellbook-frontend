import type { BrowserWindow } from 'electron'
import { EventEmitter, once } from 'node:events'
import { DEFAULT_NOTIFICATION_DURATION_MS, type ToastRequest } from '../../shared/notificationToast'
import type { ToastWindowFactory } from './toast-window-factory'

const FADE_OUT_MS = 200

export class ToastWindowController {
  private window: BrowserWindow | null = null
  private hideTimer: NodeJS.Timeout | null = null
  private inputTimer: NodeJS.Timeout | null = null
  private inputRefresh: Promise<void> | null = null
  private rendererReady = false
  private generation = 0
  private action: { id: number, run: () => void } | undefined
  private readonly readiness = new EventEmitter()

  constructor(
    private readonly factory: ToastWindowFactory,
    private readonly isGameFocused: () => Promise<boolean> = async () => false,
  ) {}

  async show(request: ToastRequest, onAction?: () => void): Promise<boolean> {
    const message = request.message.trim()
    if (!message) return false
    const current = ++this.generation
    const window = this.getOrCreate()
    if (!this.rendererReady) {
      try {
        await once(this.readiness, `ready`, { signal: AbortSignal.timeout(10_000) })
      } catch {
        return false
      }
    }
    if (current !== this.generation || !this.rendererReady || this.window !== window) return false
    const durationMs = request.durationMs ?? DEFAULT_NOTIFICATION_DURATION_MS
    this.action = typeof request.actionId === `number` && onAction ? { id: request.actionId, run: onAction } : undefined
    window.setBounds(this.factory.getTargetBounds())
    window.webContents.send(`toast:notification`, { ...request, message, durationMs })
    window.setIgnoreMouseEvents(true)
    window.showInactive()
    window.setAlwaysOnTop(true, `screen-saver`)
    this.raise()
    if (this.inputTimer) clearInterval(this.inputTimer)
    this.inputTimer = setInterval(() => void this.updateInteractivity(), 500)
    this.clearHideTimer()
    this.hideTimer = setTimeout(() => this.hideVisible(), durationMs + FADE_OUT_MS)
    return true
  }

  ready(senderId: number): void {
    if (this.window?.webContents.id !== senderId) return
    this.rendererReady = true
    this.readiness.emit(`ready`)
  }

  hide(): void {
    this.generation += 1
    this.readiness.emit(`ready`)
    this.hideVisible()
  }

  activate(senderId: number, actionId: unknown): void {
    if (this.window?.webContents.id !== senderId || !this.window.isVisible() || !this.action || this.action.id !== actionId) return
    const action = this.action
    this.hide()
    action.run()
  }

  private hideVisible(): void {
    this.action = undefined
    this.clearHideTimer()
    if (this.inputTimer) clearInterval(this.inputTimer)
    this.inputTimer = null
    if (this.window && !this.window.isDestroyed()) this.window.hide()
  }

  raise(): void {
    if (!this.window || this.window.isDestroyed() || !this.window.isVisible()) return
    this.window.moveTop()
    void this.updateInteractivity()
  }

  updateInteractivity(): Promise<void> {
    if (this.inputRefresh) return this.inputRefresh
    this.inputRefresh = this.refreshInteractivity().finally(() => { this.inputRefresh = null })
    return this.inputRefresh
  }

  private async refreshInteractivity(): Promise<void> {
    const window = this.window
    if (!window || window.isDestroyed() || !window.isVisible()) return
    try {
      const clickThrough = await this.isGameFocused()
      if (this.window === window && !window.isDestroyed() && window.isVisible()) {
        window.setIgnoreMouseEvents(clickThrough)
      }
    } catch {
      // Keep the current input mode if Core is temporarily unavailable.
    }
  }

  private getOrCreate(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window
    const window = this.factory.createWindow()
    this.window = window
    this.rendererReady = false
    window.on(`closed`, () => {
      this.window = null
      this.rendererReady = false
      this.hide()
    })
    this.factory.loadContent(window)
    return window
  }

  private clearHideTimer(): void {
    if (this.hideTimer === null) return
    clearTimeout(this.hideTimer)
    this.hideTimer = null
  }
}
