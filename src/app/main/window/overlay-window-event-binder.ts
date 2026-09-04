import type { BrowserWindow } from 'electron';

type OverlayWindowEventBinderOptions = {
  hide: () => void;
  toggleDevTools: () => void;
  clearWindow: () => void;
  requestFocusRefresh: () => void;
  isModalOpen: () => boolean
  clearModalState: () => void
};

/**
 * Binds BrowserWindow events that require controller callbacks.
 * This keeps input capture, visibility notifications, focus refresh, and close cleanup in one place.
 */
export class OverlayWindowEventBinder {
  constructor(private readonly options: OverlayWindowEventBinderOptions) {}

  bind(window: BrowserWindow): void {
    window.setAlwaysOnTop(true, 'screen-saver');
    window.setFocusable(true);
    // Never enable click-through while visible; the admin UI must capture input over the game.
    window.setIgnoreMouseEvents(false);
    window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.setMenuBarVisibility(false);

    window.webContents.on('before-input-event', (event, input) => {
      if (input.type === 'keyDown' && input.key === 'Escape' && window.isVisible()) {
        if (this.options.isModalOpen()) return
        event.preventDefault();
        this.options.hide();
        return;
      }

      if (input.type === 'keyDown' && input.key === 'F12') {
        event.preventDefault();
        this.options.toggleDevTools();
      }
    });

    window.on('closed', this.options.clearWindow);
    window.on('show', () => this.onVisibilityChanged(window));
    window.on('hide', () => this.onVisibilityChanged(window));
    window.on('focus', this.options.requestFocusRefresh);
    window.on('blur', this.options.requestFocusRefresh);
    // Fires again after dev-server reloads, so the fresh renderer always gets current visibility.
    window.webContents.on('did-finish-load', () => {
      this.options.clearModalState()
      this.sendVisibility(window)
    })
  }

  private onVisibilityChanged(window: BrowserWindow): void {
    this.sendVisibility(window);
    this.options.requestFocusRefresh();
  }

  private sendVisibility(window: BrowserWindow): void {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send('overlay:visibility', window.isVisible());
    }
  }
}
