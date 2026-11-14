import { withActionValidation, type ActionExecutionOptions } from '../core/actionClient'
import type { ActionTarget } from '@spellbook/shared/actions/actionTypes'
import type { ActionEventAction } from '@spellbook/shared/actionEvents'
import type { CoreCommand } from '../../shared/coreAction'
import { executeLocalAction } from '../services/actions/localActionReporter'
import type { CurrentGameSnapshotStore } from '../services/currentGameSnapshotStore'
import type { IpcMain } from 'electron';
import type { HttpClient } from '../api/http-client';
import type { RequestIdFactory } from '../request-id-factory';
import type { OverlayActivityGuard } from '../services/overlay-activity-guard';
import type { ModerationPayload } from '../types';
import type { ManualActionAccess } from '../services/actions/manualActionAccess'

/**
 * Registers moderation IPC handlers that build game-affecting Core requests.
 * Every action is guarded because kick, ban, unban, and warn ultimately type into the game console.
 */
export class ModerationIpcHandlers {
  constructor(
    private readonly ipcMain: IpcMain,
    private readonly httpClient: HttpClient,
    private readonly requestIds: RequestIdFactory,
    private readonly overlayActivity: OverlayActivityGuard,
    private readonly actionAccess: Pick<ManualActionAccess, `check`>,
    private readonly snapshots?: Pick<CurrentGameSnapshotStore, `get`>
  ) {}

  register(): void {
    // Every moderation action ultimately types into the game console, so each path uses the activity guard.
    this.ipcMain.handle('core:kick', async (_event, payload: ModerationPayload) => {
      const playfabId = typeof payload?.playfabId === 'string' ? payload.playfabId.trim() : '';
      const reason = typeof payload?.reason === 'string' ? payload.reason.trim() : '';
      const denied = await this.actionAccess.check()
      if (denied) return denied
      const inactiveResult = this.overlayActivity.getInactiveGameCommandResult();

      if (inactiveResult) {
        return inactiveResult;
      }

      return withActionValidation(async () => this.execute(`kick`, { type: `player`, playfabId },
        { label: `Kick`, iconKey: `triangle-exclamation`, commands: [{ commandType: `kick`, message: reason }] },
        this.httpClient.commands.kick(playfabId, reason)))
    });

    this.ipcMain.handle('core:ban', async (_event, payload: ModerationPayload) => {
      const playfabId = typeof payload?.playfabId === 'string' ? payload.playfabId.trim() : '';
      const reason = typeof payload?.reason === 'string' ? payload.reason.trim() : '';
      const hours = typeof payload?.hours === 'number' ? payload.hours : Number(payload?.hours);
      const denied = await this.actionAccess.check()
      if (denied) return denied
      const inactiveResult = this.overlayActivity.getInactiveGameCommandResult();

      if (inactiveResult) {
        return inactiveResult;
      }

      return withActionValidation(async () => this.execute(`ban`, { type: `player`, playfabId },
        { label: `Ban`, iconKey: `ban`, commands: [{ commandType: `ban`, message: reason }] },
        this.httpClient.commands.ban(playfabId, hours, reason)))
    });

    this.ipcMain.handle('core:unban', async (_event, payload: ModerationPayload) => {
      const playfabId = typeof payload?.playfabId === 'string' ? payload.playfabId.trim() : ''
      const denied = await this.actionAccess.check()
      if (denied) return denied
      const inactiveResult = this.overlayActivity.getInactiveGameCommandResult()

      if (inactiveResult) {
        return inactiveResult
      }

      return withActionValidation(async () => this.execute(`unban`, { type: `player`, playfabId },
        { label: `Unban`, iconKey: `gavel`, commands: [{ commandType: `unban` }] },
        this.httpClient.commands.unban(playfabId)))
    })

    this.ipcMain.handle('core:warn', async (_event, payload: ModerationPayload) => {
      const message = typeof payload?.message === 'string' ? payload.message.trim() : '';
      const denied = await this.actionAccess.check()
      if (denied) return denied
      const inactiveResult = this.overlayActivity.getInactiveGameCommandResult();

      if (inactiveResult) {
        return inactiveResult;
      }

      return withActionValidation(async () => this.execute(`warn`, playfabIdTarget(payload),
        { label: `Warn`, iconKey: `bullhorn`, commands: [{ commandType: `warn`, message }] },
        this.httpClient.commands.message(`server`, message), { messageContributions: [] }))
    });
  }
  private execute(scope: string, target: ActionTarget, action: ActionEventAction, commands: CoreCommand[],
    options: Pick<ActionExecutionOptions, `messageContributions`> = {}) {
    const id = this.requestIds.next(scope)
    return executeLocalAction(this.httpClient, { coreActionId: id, gameServerId: this.snapshots?.get()?.gameServerId ?? 0, target, action },
      () => this.httpClient.executeAction(commands, { id, author: `user`, priority: `normal`, ...options }))
  }

}

function playfabIdTarget(payload: ModerationPayload) {
  const playfabId = typeof payload?.playfabId === `string` ? payload.playfabId.trim() : ``
  return playfabId ? { type: `player` as const, playfabId } : { type: `server` as const }
}
