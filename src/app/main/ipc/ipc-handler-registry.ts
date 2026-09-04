import { shell, type IpcMain } from 'electron';
import type { HttpClient } from '../api/http-client';
import type { FocusMonitor } from '../focus/focus-monitor';
import type { AppHealthService } from '../health/app-health-service';
import type { RequestIdFactory } from '../request-id-factory';
import type { AppSettingsService } from '../services/app-settings-service';
import type { AntiAfkService } from '../services/anti-afk-service'
import type { CurrentGameSnapshotStore } from '../services/currentGameSnapshotStore'
import type { ListPlayersPoller } from '../services/listPlayersPoller'
import type { OverlayActivityGuard } from '../services/overlay-activity-guard';
import type { SentinelService } from '../services/sentinelService'
import type { OverlayWindowController } from '../window/overlay-window-controller';
import type { ToastWindowController } from '../window/toast-window-controller';
import { CoreIpcHandlers } from './core-ipc-handlers';
import { AntiAfkIpcHandlers } from './anti-afk-ipc-handlers'
import { ModerationIpcHandlers } from './moderation-ipc-handlers';
import { OverlayIpcHandlers } from './overlay-ipc-handlers';
import { ServerIpcHandlers } from './server-ipc-handlers';
import { SettingsIpcHandlers } from './settings-ipc-handlers';
import type { AuthIpcHandlers } from './auth-ipc-handlers';
import { SentinelIpcHandlers } from './sentinel-ipc-handlers'
import { DiscordInstallIpcHandlers } from './discord-install-ipc-handlers'
import type { AppUpdateService } from '../services/appUpdateService'

type IpcHandlerRegistryOptions = {
  ipcMain: IpcMain;
  httpClient: HttpClient;
  overlayWindow: OverlayWindowController;
  focusMonitor: FocusMonitor;
  appHealthService: AppHealthService;
  listPlayersPoller: ListPlayersPoller
  currentGameSnapshots: CurrentGameSnapshotStore
  sentinel: SentinelService
  overlayActivity: OverlayActivityGuard;
  requestIds: RequestIdFactory;
  appSettings: AppSettingsService;
  toastWindow: ToastWindowController;
  auth: AuthIpcHandlers;
  antiAfk: AntiAfkService
  notificationPollMs: number
  appUpdates: AppUpdateService
};

/**
 * Composes the channel-family IPC handler classes.
 * The registry is the only place that knows all IPC dependencies, keeping index.ts lifecycle-only.
 */
export class IpcHandlerRegistry {
  constructor(private readonly options: IpcHandlerRegistryOptions) {}

  register(): void {
    const { appHealthService, appSettings, httpClient, ipcMain, listPlayersPoller, overlayActivity, requestIds } = this.options;
    const { focusMonitor, overlayWindow } = this.options;

    new OverlayIpcHandlers(
      ipcMain,
      overlayWindow,
      focusMonitor,
      this.options.toastWindow,
      overlayActivity,
      this.options.notificationPollMs,
      this.options.appUpdates,
    ).register();
    new SettingsIpcHandlers(ipcMain, appSettings, overlayWindow, httpClient).register();
    this.options.auth.register();
    new AntiAfkIpcHandlers(ipcMain, this.options.antiAfk).register()
    new SentinelIpcHandlers(ipcMain, this.options.sentinel, overlayWindow).register()
    new ServerIpcHandlers(ipcMain, httpClient).register();
    new DiscordInstallIpcHandlers(ipcMain, httpClient, url => shell.openExternal(url)).register()
    new CoreIpcHandlers(
      ipcMain,
      httpClient,
      appHealthService,
      listPlayersPoller,
      this.options.currentGameSnapshots,
      requestIds,
      overlayActivity,
      overlayWindow
    ).register();
    new ModerationIpcHandlers(ipcMain, httpClient, requestIds, overlayActivity).register();
  }
}
