import { usesServerMessageFacts, type MessageFacts } from '@spellbook/shared/actions/messageFacts'
import type { TagTypeDefinition } from '@spellbook/shared/actions/tagTypeDefinitions.js'
import { ActionHandler } from '../services/actions/actionHandler'
import { executeLocalAction } from '../services/actions/localActionReporter'
import type { ActionRecipe, ActionTarget, ActionContext, PreparedAction } from '@spellbook/shared/actions/actionTypes'
import { actionPriority } from '../core/actionPriority'
import { withActionValidation } from '../core/actionClient'
import type { IpcMain } from 'electron';
import type { HttpClient } from '../api/http-client';
import type { AppHealthService } from '../health/app-health-service';
import type { RequestIdFactory } from '../request-id-factory';
import type { CurrentGameSnapshotStore } from '../services/currentGameSnapshotStore'
import type { ListPlayersPoller } from '../services/listPlayersPoller'
import type { OverlayActivityGuard } from '../services/overlay-activity-guard';
import type { CommandBatchPayload, CommandPayload, CoreCallResult, MessagePayload } from '../types';
import type { OverlayWindowController } from '../window/overlay-window-controller'
import type { GameStateService } from '../gameState/gameStateService'
import type { ManualActionAccess } from '../services/actions/manualActionAccess'
import { isPlayerActionSnapshotFresh } from '../../shared/playerActionFreshness'

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
    private readonly overlayWindow: OverlayWindowController,
    private readonly gameState: GameStateService,
    private readonly actionAccess: Pick<ManualActionAccess, `check`>
  ) {}

  register(): void {
    this.ipcMain.handle('core:health', async () => this.appHealthService.getHealth());
    this.ipcMain.handle(`core:inputConfig`, async () => this.httpClient.callCore(`/chivalry2/input/`, { method: `GET` }))

    this.ipcMain.handle(`core:listPlayers`, () => this.listPlayersPoller.refreshNow(`user`))
    this.ipcMain.handle(`core:currentGameSnapshot`, () => this.currentGameSnapshots.get())
    this.ipcMain.handle(`core:refreshCurrentGameSnapshot`, () => this.listPlayersPoller.refreshNow(`user`))
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

      if (!this.gameState.isInGameServer()) {
        return { ok: false, status: 409, statusText: `NOT_IN_GAME_SERVER`, data: null,
          error: { code: `NOT_IN_GAME_SERVER`, message: `Join a game server before sending a message.` } }
      }

      const denied = await this.actionAccess.check()
      if (denied) return denied
      const inactiveResult = this.overlayActivity.getInactiveGameCommandResult()
      if (inactiveResult) {
        return inactiveResult
      }

      return withActionValidation(async () => {
        const commands = this.httpClient.commands.message(kind, message)
        const id = this.requestIds.next(`message`)
        return executeLocalAction(this.httpClient, { coreActionId: id, gameServerId: this.currentGameSnapshots.get?.()?.gameServerId ?? 0,
          target: { type: `server` }, action: { label: kind === `admin` ? `Adminsay` : `Serversay`, iconKey: `circle-info`,
            commands: [{ commandType: kind === `admin` ? `admin_message` : `server_message`, message }] } },
          () => this.httpClient.executeAction(commands, { id, author: `user`, priority: `normal` }))
      })
    })

    this.ipcMain.handle(`core:actionRecipe`, async (_event, payload: { recipe: ActionRecipe & { profileId?: number, actionKey?: string }, target: ActionTarget, context: ActionContext, gameServerId: number }) => {
      const definitions = await this.httpClient.getServer(`/definitions/tag-types`)
      const envelope = definitions.data as { ok?: boolean, data?: TagTypeDefinition[] } | null
      if (!definitions.ok || envelope?.ok === false || !Array.isArray(envelope?.data)) throw new Error(`Could not load tag definitions.`)
      const actionContext: ActionContext = { ...payload.context, tagDefinitions: envelope.data }
      if (usesServerMessageFacts(payload.recipe.commands)) {
        const result = await this.httpClient.getServer(`/actions/message-context/${payload.gameServerId}`)
        const facts = result.data as { ok?: boolean, data?: MessageFacts } | null
        if (!result.ok || facts?.ok === false || !facts?.data) throw new Error(`Could not load message context.`)
        Object.assign(actionContext, facts.data)
      }
      let snapshot = this.currentGameSnapshots.get()
      if (!snapshot || !isPlayerActionSnapshotFresh(snapshot.observedAt)) {
        await this.listPlayersPoller.refreshNow(`user`)
        snapshot = this.currentGameSnapshots.get()
      }
      if (!snapshot || !isPlayerActionSnapshotFresh(snapshot.observedAt) || snapshot.gameServerId !== payload.gameServerId) throw new RangeError(`Current server does not match action target.`)
      const denied = await this.actionAccess.check(payload.gameServerId, payload.target.type === `player` ? payload.target.playfabId : undefined)
      if (denied) return { result: denied, prepared: null }
      const inactive = this.overlayActivity.beginGameCommandBatch()
      if (inactive) return { result: inactive, prepared: null }
      const id = this.requestIds.next(`profile`)
      const action = { label: payload.recipe.label, iconKey: payload.recipe.iconKey ?? `circle-info` as const,
        commands: payload.recipe.commands.map(command => ({ commandType: command.commandType, message: command.message })) }
      const unsubscribe = this.currentGameSnapshots.subscribe(current => {
        if (!current || current.gameServerId !== payload.gameServerId) void this.httpClient.callCore(`/v3/actions/${encodeURIComponent(id)}/cancel`, { method: `POST` }).catch(error => console.warn(`[Actions] Cancellation failed`, error))
      })
      try {
        let prepared: PreparedAction | null = null
        const result = await executeLocalAction(this.httpClient, { coreActionId: id, gameServerId: snapshot.gameServerId,
          target: payload.target, action,
          ...(payload.recipe.profileId && payload.recipe.actionKey ? { profile: { profileId: payload.recipe.profileId, actionKey: payload.recipe.actionKey } } : {}) }, async () => {
          const execution = await new ActionHandler(this.httpClient).execute(payload.recipe, payload.target, actionContext, {
            id, author: `user`, priority: `normal`
          })
          prepared = execution.prepared
          action.commands = execution.prepared.spans.map(span => ({ commandType: span.command.commandType, message: span.message }))
          return execution.result
        })
        return { result, prepared }
      } finally { unsubscribe(); this.overlayActivity.endGameCommandBatch() }
    })

    this.ipcMain.handle('core:commandBatch', async (_event, payload: CommandBatchPayload) => {
      const commands = Array.isArray(payload?.commands) ? payload.commands : []

      if (commands.length === 0) {
        return CoreIpcHandlers.invalidCommandBatchResult()
      }

      const denied = await this.actionAccess.check()
      if (denied) return denied
      const inactiveResult = this.overlayActivity.beginGameCommandBatch()
      if (inactiveResult) {
        return inactiveResult
      }

      try {
        return await withActionValidation(async () => {
          const prepared = this.httpClient.commands.batch(commands)
          return this.httpClient.executeAction(prepared, {
            id: this.requestIds.next(`batch`), author: `user`,
            priority: actionPriority(`user`, prepared, this.httpClient.sentinelEnabled), messageContributions: messageContributions(commands)
          })
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

      const denied = await this.actionAccess.check()
      if (denied) return denied
      const inactiveResult = this.overlayActivity.getInactiveGameCommandResult();
      if (inactiveResult) {
        return inactiveResult;
      }

      return withActionValidation(async () => {
        const commands = this.httpClient.commands.raw(command, {
          expectClipboard: payload.expectClipboard === true,
          restoreClipboard: payload.restoreClipboard !== false
        })
        return this.httpClient.executeAction(commands, {
          id: this.requestIds.next(`command`), author: `user`,
          priority: actionPriority(`user`, commands, this.httpClient.sentinelEnabled)
        })
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
import { messageContributions } from '../api/consoleMessageStatistics'
