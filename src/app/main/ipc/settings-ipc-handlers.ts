import type { IpcMain } from 'electron';
import type { AppSettingsService } from '../services/app-settings-service';
import type { OverlayWindowController } from '../window/overlay-window-controller';
import type { HttpClient } from '../api/http-client';

export class SettingsIpcHandlers {
  constructor(
    private readonly ipcMain: IpcMain,
    private readonly appSettings: AppSettingsService,
    private readonly overlayWindow: OverlayWindowController,
    private readonly httpClient: HttpClient
  ) {}

  register(): void {
    this.ipcMain.handle('settings:get', async () => {
      const result = await this.httpClient.getServer('/users/me/settings');
      const settings = SettingsIpcHandlers.envelopeData(result.data);

      if (result.ok && settings) await this.appSettings.updateSettings(settings);
      return this.appSettings.getSnapshot();
    });
    this.ipcMain.handle('settings:update', async (_event, update: unknown) => {
      const previousDisplayId = this.appSettings.getSettings().selectedDisplayId;
      await this.appSettings.updateSettings(update);
      const snapshot = this.appSettings.getSnapshot();
      await this.httpClient.patchServer('/users/me/settings', { settings: snapshot.settings });

      if (snapshot.effectiveDisplayId !== previousDisplayId) {
        this.overlayWindow.moveToSelectedDisplay();
      }

      return snapshot;
    });
  }

  private static envelopeData(value: unknown): Record<string, unknown> | null {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
    const data = (value as Record<string, unknown>).data;
    return typeof data === 'object' && data !== null && !Array.isArray(data)
      ? data as Record<string, unknown>
      : null;
  }
}