import { globalShortcut } from 'electron';
import type { OverlayWindowController } from './overlay-window-controller';

/**
 * Registers global Electron shortcuts for the overlay process.
 * F4 runs a game snapshot lookup, F3 toggles the admin overlay, and F12 opens detached DevTools
 * even when the overlay is hidden.
 */
export class ShortcutRegistry {
  constructor(
    private readonly overlayWindow: OverlayWindowController,
    private readonly runSnapshotLookup: () => void
  ) {}

  register(): void {
    if (!globalShortcut.register('F4', () => this.runSnapshotLookup())) {
      console.warn('Could not register global F4 snapshot shortcut; another app or stale overlay instance may already own it.');
    }

    if (!globalShortcut.register('F3', () => this.overlayWindow.toggle())) {
      console.warn('Could not register global F3 overlay shortcut; another app or stale overlay instance may already own it.');
    }

    if (!globalShortcut.register('F12', () => this.overlayWindow.toggleDevTools())) {
      console.warn('Could not register global F12 DevTools shortcut; another app or stale overlay instance may already own it. Focused overlay F12 still works.');
    }
  }

  unregisterAll(): void {
    globalShortcut.unregisterAll();
  }
}