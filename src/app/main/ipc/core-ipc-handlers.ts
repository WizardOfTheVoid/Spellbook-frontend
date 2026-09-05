import type { IpcMain } from 'electron';
import type { HttpClient } from '../api/http-client';
import type { AppHealthService } from '../health/app-health-service';
import type { RequestIdFactory } from '../request-id-factory';
import type { CurrentGameSnapshotStore } from '../services/currentGameSnapshotStore'
import type { ListPlayersPoller } from '../services/listPlayersPoller'
import type { OverlayActivityGuard } from '../services/overlay-activity-guard';
import type { CommandBatchPayload, CommandPayload, CoreCallResult, MessagePayload } from '../types';
import type { OverlayWindowController } from '../window/overlay-window-controller'

/**
 * Registers Core IPC handlers that are not moderation-specific.
 * Raw console commands are guarded because they can cause Core to focus and type into the game.
 */
export class CoreIpcHandlers {
  constructor(
    private readonly ipcMain: IpcMain,
    private readonly httpClient: HttpClient,
    private readonly appHealthService: AppHealthService,
    private readonly listPlayersPoller: ListPlayersPoller,
    private readonly currentGameSnapshots: CurrentGameSnapshotStore,
    private readonly requestIds: RequestIdFactory,
    private readonly overlayActivity: OverlayActivityGuard,
    private readonly overlayWindow: OverlayWindowController
  ) {}

  register(): void {
    this.ipcMain.handle('core:health', async () => this.appHealthService.getHealth());
    this.ipcMain.handle('core:meta', async () => this.httpClient.callCore('/v2/meta/get', {
      method: 'GET'
    }))

    this.ipcMain.handle('core:snapshot', async () => this.httpClient.callCore('/v2/console/snapshot', {
      method: 'POST',
      body: JSON.stringify({ id: this.requestIds.next('snapshot') })
    }));

    this.ipcMain.handle(`core:listPlayers`, () => this.listPlayersPoller.refreshNow())
    this.ipcMain.handle(`core:currentGameSnapshot`, () => this.currentGameSnapshots.get())
    this.ipcMain.handle(`core:refreshCurrentGameSnapshot`, () => this.listPlayersPoller.refreshNow())
    this.currentGameSnapshots.subscribe(snapshot => {
      this.overlayWindow.sendToCurrent(`core:currentGameSnapshotChanged`, snapshot)
    })

    this.ipcMain.handle('core:nativeListPlayers', async () => this.httpClient.callCore('/v2/native/listplayers', {
      method: 'POST',
      body: JSON.stringify({ id: this.requestIds.next('native-listplayers') })
    }))

    this.ipcMain.handle('core:message', async (_event, payload: MessagePayload) => {
      const kind = payload?.kind === 'admin' || payload?.kind === 'server' ? payload.kind : null
      const message = typeof payload?.message === 'string' ? payload.message.trim() : ''

      if (!kind) {
        return CoreIpcHandlers.invalidMessageResult('Message kind must be admin or server.')
      }

      if (!message) {
        return CoreIpcHandlers.invalidMessageResult('Message is required.')
      }

      const inactiveResult = this.overlayActivity.getInactiveGameCommandResult()
      if (inactiveResult) {
        return inactiveResult
      }

      return this.httpClient.postCoreInput('/v2/console/message', {
        id: this.requestIds.next('message'),
        kind,
        message
      })
    })

    this.ipcMain.handle('core:commandBatch', async (_event, payload: CommandBatchPayload) => {
      const commands = Array.isArray(payload?.commands) ? payload.commands : []

      if (commands.length === 0) {
        return CoreIpcHandlers.invalidCommandBatchResult()
      }

      const inactiveResult = this.overlayActivity.beginGameCommandBatch()
      if (inactiveResult) {
        return inactiveResult
      }

      try {
        return await this.httpClient.postCoreInput('/v2/console/batch', {
          id: this.requestIds.next('batch'),
          commands
        })
      } finally {
        this.overlayActivity.endGameCommandBatch()
      }
    })

    this.ipcMain.handle('core:command', async (_event, payload: CommandPayload) => {
      const command = typeof payload?.command === 'string' ? payload.command.trim() : '';

      if (command.length === 0) {
        return CoreIpcHandlers.invalidCommandResult();
      }

      // Raw console commands can affect the game, so require foreground overlay interaction first.
      const inactiveResult = this.overlayActivity.getInactiveGameCommandResult();
      if (inactiveResult) {
        return inactiveResult;
      }

      return this.httpClient.postCoreInput('/v2/console/command', {
        id: this.requestIds.next('command'),
        command,
        expectClipboard: payload.expectClipboard === true,
        restoreClipboard: payload.restoreClipboard !== false,
        timeoutMs: payload.expectClipboard === true ? 5000 : undefined
      })
    });
  }

  private static invalidCommandResult(): CoreCallResult {
    return {
      ok: false,
      status: 400,
      statusText: 'INVALID_REQUEST',
      data: null,
      error: {
        code: 'INVALID_REQUEST',
        message: 'Command is required.'
      }
    };
  }

  private static invalidCommandBatchResult(): CoreCallResult {
    return {
      ok: false,
      status: 400,
      statusText: 'INVALID_REQUEST',
      data: null,
      error: {
        code: 'INVALID_REQUEST',
        message: 'At least one command is required.'
      }
    }
  }

  private static invalidMessageResult(message: string): CoreCallResult {
    return {
      ok: false,
      status: 400,
      statusText: 'INVALID_REQUEST',
      data: null,
      error: {
        code: 'INVALID_REQUEST',
        message
      }
    }
  }
}
