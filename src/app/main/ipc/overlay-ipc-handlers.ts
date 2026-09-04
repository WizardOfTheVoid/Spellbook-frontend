import type { IpcMain } from 'electron';
import type { FocusMonitor } from '../focus/focus-monitor';
import type { OverlayActivityGuard } from '../services/overlay-activity-guard'
import type { ToastRequest } from '../types';
import type { OverlayWindowController } from '../window/overlay-window-controller';
import type { ToastWindowController } from '../window/toast-window-controller';

type AppUpdates = {
  check: () => Promise<string | null>
  openLatestRelease: () => Promise<void>
}

/**
 * Registers overlay-window IPC handlers that stay inside Electron main.
 * These calls read or change overlay state without sending commands to Core or the game.
 */
export class OverlayIpcHandlers {
  constructor(
    private readonly ipcMain: IpcMain,
    private readonly overlayWindow: OverlayWindowController,
    private readonly focusMonitor: FocusMonitor,
    private readonly toastWindow: ToastWindowController,
    private readonly overlayActivity: OverlayActivityGuard,
    private readonly notificationPollMs: number,
    private readonly appUpdates: AppUpdates,
  ) {}

  register(): void {
    this.ipcMain.handle('overlay:isVisible', () => this.overlayWindow.isVisible());
    this.ipcMain.handle('overlay:hide', () => this.overlayWindow.hide());
    this.ipcMain.handle('overlay:show', () => this.overlayWindow.show());
    this.ipcMain.handle(`overlay:setModalOpen`, (_event, open: unknown) =>
      this.overlayWindow.setModalOpen(open === true)
    )
    this.ipcMain.on(`overlay:textInputActive`, (_event, active: unknown) => {
      this.overlayActivity.setTextInputActive(active === true)
    })
    this.ipcMain.handle('overlay:focusState', () => this.focusMonitor.refresh());
    this.ipcMain.handle('overlay:notificationPollMs', () => this.notificationPollMs)
    this.ipcMain.handle(`app:update:check`, () => this.appUpdates.check())
    this.ipcMain.handle(`app:update:open`, () => this.appUpdates.openLatestRelease())
    this.ipcMain.handle('toast:show', (_event, request: ToastRequest) => this.toastWindow.show(request));
    this.ipcMain.handle('toast:hide', () => this.toastWindow.hide());

    // Fire-and-forget so renderer diagnostics reach the same terminal as the main-process logs.
    this.ipcMain.on('overlay:debugLog', (_event, scope: unknown, message: unknown) => {
      if (typeof scope !== 'string' || typeof message !== 'string') return;
      console.log(`[${scope}] ${message}`);
    });
  }
}
