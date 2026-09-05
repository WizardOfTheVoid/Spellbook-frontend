import type { BrowserWindow } from 'electron';
import type { ToastRequest } from '../types';
import type { ToastWindowFactory } from './toast-window-factory';

const DEFAULT_DURATION_MS = 4000;
const FADE_OUT_MS = 400;

/**
 * Owns the toast BrowserWindow and keeps it visible only while a notification is queued.
 */
export class ToastWindowController {
  private window: BrowserWindow | null = null;
  private hideTimer: NodeJS.Timeout | null = null;

  constructor(private readonly factory: ToastWindowFactory) {}

  show(request: ToastRequest): void {
    const message = request.message.trim();
    if (!message) return;

    const window = this.getOrCreate();
    const durationMs = request.durationMs ?? DEFAULT_DURATION_MS;

    window.setBounds(this.factory.getTargetBounds());
    window.webContents.send('toast:notification', { ...request, message, durationMs });
    window.showInactive();
    window.setAlwaysOnTop(true, 'screen-saver');

    this.clearHideTimer();
    this.hideTimer = setTimeout(() => this.hide(), durationMs + FADE_OUT_MS);
  }

  hide(): void {
    this.clearHideTimer();
    if (this.window && !this.window.isDestroyed()) this.window.hide();
  }

  private getOrCreate(): BrowserWindow {
    if (this.window && !this.window.isDestroyed()) return this.window;

    const window = this.factory.createWindow();
    window.on('closed', () => { this.window = null; });
    this.factory.loadContent(window);
    this.window = window;

    return window;
  }

  private clearHideTimer(): void {
    if (this.hideTimer === null) return;
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }
}
