import { app, BrowserWindow } from 'electron';
import { OverlayWindowEventBinder } from './overlay-window-event-binder';
import type { OverlayWindowFactory } from './overlay-window-factory';

/**
 * Owns the overlay BrowserWindow instance and tells services when Core/game calls are allowed.
 */
export class OverlayWindowController {
  private window: BrowserWindow | null = null;
  private modalOpen = false
  private readonly eventBinder: OverlayWindowEventBinder;

  constructor(
    private readonly factory: OverlayWindowFactory,
    private readonly requestFocusRefresh: () => void
  ) {
    this.eventBinder = new OverlayWindowEventBinder({
      hide: () => this.hide(),
      toggleDevTools: () => this.toggleDevTools(),
      clearWindow: () => {
        this.setModalOpen(false)
        this.window = null
      },
      requestFocusRefresh: this.requestFocusRefresh,
      isModalOpen: () => this.isModalOpen(),
      clearModalState: () => this.setModalOpen(false)
    });
  }

  getOrCreate(): BrowserWindow {
    this.window ??= this.create();
    return this.window;
  }

  getCurrent(): BrowserWindow | null {
    return this.window;
  }

  sendToCurrent(channel: string, ...args: unknown[]): boolean {
    const window = this.window
    if (!window || window.isDestroyed() || window.webContents.isDestroyed()) return false

    window.webContents.send(channel, ...args)
    return true
  }

  setModalOpen(open: boolean): void {
    this.modalOpen = open
  }

  isModalOpen(): boolean {
    return this.modalOpen
  }

  show(): void {
    const window = this.getOrCreate();
    this.moveToSelectedDisplay();
    window.setResizable(false);
    window.setFocusable(true);
    window.setIgnoreMouseEvents(false);
    window.show();
    window.setAlwaysOnTop(true, 'screen-saver');
    window.moveTop();
    app.focus({ steal: true });
    window.focus();
    window.webContents.focus();
  }

  hide(): void {
    this.setModalOpen(false)
    const window = this.getOrCreate();
    if (window.isVisible()) window.hide();
  }

  toggle(): void {
    const window = this.getOrCreate();

    if (window.isVisible()) {
      this.hide()
      return;
    }

    this.show();
  }

  toggleDevTools(): void {
    const window = this.getOrCreate();

    if (!window.isVisible()) {
      this.show();
    }

    if (window.webContents.isDevToolsOpened()) {
      window.webContents.closeDevTools();
      return;
    }

    window.webContents.openDevTools({ mode: 'detach' });
  }

  isVisible(): boolean {
    return this.getOrCreate().isVisible();
  }

  isFocused(): boolean {
    return this.window?.isFocused() === true;
  }

  moveToSelectedDisplay(): void {
    this.getOrCreate().setBounds(this.factory.getTargetDisplayBounds());
  }

  isForegroundInteractive(): boolean {
    // This is the Electron-side gate used to skip Core pulses and game commands while inactive.
    const window = this.window;
    return Boolean(window && !window.isDestroyed() && window.isVisible() && !window.isMinimized() && window.isFocused());
  }

  private create(): BrowserWindow {
    const window = this.factory.createWindow();
    this.eventBinder.bind(window);
    this.setModalOpen(false)
    this.factory.loadContent(window);

    return window;
  }
}
