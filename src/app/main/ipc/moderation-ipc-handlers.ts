import type { IpcMain } from 'electron';
import type { HttpClient } from '../api/http-client';
import type { RequestIdFactory } from '../request-id-factory';
import type { OverlayActivityGuard } from '../services/overlay-activity-guard';
import type { ModerationPayload } from '../types';

/**
 * Registers moderation IPC handlers that build game-affecting Core requests.
 * Every action is guarded because kick, ban, unban, and warn ultimately type into the game console.
 */
export class ModerationIpcHandlers {
  constructor(
    private readonly ipcMain: IpcMain,
    private readonly httpClient: HttpClient,
    private readonly requestIds: RequestIdFactory,
    private readonly overlayActivity: OverlayActivityGuard
  ) {}

  register(): void {
    // Every moderation action ultimately types into the game console, so each path uses the activity guard.
    this.ipcMain.handle('core:kick', async (_event, payload: ModerationPayload) => {
      const playfabId = typeof payload?.playfabId === 'string' ? payload.playfabId.trim() : '';
      const reason = typeof payload?.reason === 'string' ? payload.reason.trim() : '';
      const inactiveResult = this.overlayActivity.getInactiveGameCommandResult();

      if (inactiveResult) {
        return inactiveResult;
      }

      return this.httpClient.postCoreInput('/v2/console/kick', {
        id: this.requestIds.next('kick'),
        playfabId,
        reason
      })
    });

    this.ipcMain.handle('core:ban', async (_event, payload: ModerationPayload) => {
      const playfabId = typeof payload?.playfabId === 'string' ? payload.playfabId.trim() : '';
      const reason = typeof payload?.reason === 'string' ? payload.reason.trim() : '';
      const hours = typeof payload?.hours === 'number' ? payload.hours : Number(payload?.hours);
      const inactiveResult = this.overlayActivity.getInactiveGameCommandResult();

      if (inactiveResult) {
        return inactiveResult;
      }

      return this.httpClient.postCoreInput('/v2/console/ban', {
        id: this.requestIds.next('ban'),
        playfabId,
        hours,
        reason
      })
    });

    this.ipcMain.handle('core:unban', async (_event, payload: ModerationPayload) => {
      const playfabId = typeof payload?.playfabId === 'string' ? payload.playfabId.trim() : ''
      const inactiveResult = this.overlayActivity.getInactiveGameCommandResult()

      if (inactiveResult) {
        return inactiveResult
      }

      return this.httpClient.postCoreInput('/v2/console/unban', {
        id: this.requestIds.next('unban'),
        playfabId
      })
    })

    this.ipcMain.handle('core:warn', async (_event, payload: ModerationPayload) => {
      const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
      const inactiveResult = this.overlayActivity.getInactiveGameCommandResult();

      if (inactiveResult) {
        return inactiveResult;
      }

      return this.httpClient.postCoreInput('/v2/console/warn', {
        id: this.requestIds.next('warn'),
        message
      })
    });
  }
}
