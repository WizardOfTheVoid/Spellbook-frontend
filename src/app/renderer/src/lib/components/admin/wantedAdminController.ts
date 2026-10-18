import { getCoreApi } from '$lib/core'
import { fetchPlayerProfile } from '$lib/utils/serverProfilesApi'
import {
  createWantedPlayer as createMockWantedAction,
  getWantedPlayer,
  revertWantedPlayer
} from '$lib/utils/wantedActionsApi'

export type WantedAdminAction = 'mock' | 'revert'

export type WantedAdminState = Readonly<{
  running: WantedAdminAction | null
}>

export type WantedAdminOutcome = Readonly<{
  ok: boolean
  message: string
}> | null

type Snapshot = {
  gameServerId: number
  players: readonly { playfabId: string, name: string }[]
}

type PlayerProfile = {
  player: { id: number, playfabId: string }
}

type WantedState = {
  sourceAction: { id: number, actionType: string } | null
}

export type WantedAdminDependencies = {
  currentGameSnapshot: () => Promise<Snapshot | null>
  fetchPlayerProfile: (playfabId: string) => Promise<PlayerProfile>
  getWantedPlayer: (playerId: number) => Promise<WantedState | null>
  createMock: (input: {
    playfabId: string
    playerName?: string
    gameServerId: number
  }) => Promise<unknown>
  revert: (playerId: number, sourceActionId: number) => Promise<unknown>
  confirm: (message: string) => boolean
}

export class WantedAdminController {
  state: WantedAdminState = { running: null }

  private generation = 0
  private userId: number | null = null
  private active = false
  private destroyed = false

  constructor(
    private readonly dependencies: WantedAdminDependencies = defaultDependencies(),
    private readonly onChange: (state: WantedAdminState) => void = () => undefined
  ) {}

  setContext(userId: number | null, active: boolean): void {
    if (this.userId === userId && this.active === active) return
    this.generation += 1
    this.userId = userId
    this.active = active && isPositiveId(userId)
    this.setRunning(null)
  }

  runMock(playfabInput: string): Promise<WantedAdminOutcome> {
    return this.run('mock', async token => {
      const playfabId = playfabInput.trim()
      if (!playfabId) return failed('Enter a PlayFab ID.')

      const snapshot = await this.dependencies.currentGameSnapshot()
      if (!this.isCurrent(token)) return null
      if (!snapshot || !isPositiveId(snapshot.gameServerId)) {
        return failed('No active game server is available.')
      }

      const playerName = snapshot.players.find(player => player.playfabId === playfabId)?.name
      await this.dependencies.createMock({
        playfabId,
        ...(playerName ? { playerName } : {}),
        gameServerId: snapshot.gameServerId
      })
      return this.isCurrent(token)
        ? succeeded('Mock Wanted action created.')
        : null
    })
  }

  runRevert(playfabInput: string): Promise<WantedAdminOutcome> {
    return this.run('revert', async token => {
      const playfabId = playfabInput.trim()
      if (!playfabId) return failed('Enter a PlayFab ID.')

      const profile = await this.dependencies.fetchPlayerProfile(playfabId)
      if (!this.isCurrent(token)) return null
      if (!isPositiveId(profile.player.id)) return failed('Player profile could not be resolved.')

      const wanted = await this.dependencies.getWantedPlayer(profile.player.id)
      if (!this.isCurrent(token)) return null
      const source = wanted?.sourceAction
      if (!source || source.actionType !== 'ban' || !isPositiveId(source.id)) {
        return failed('Only an active Wanted ban can be reverted.')
      }

      const confirmed = this.dependencies.confirm(`Revert the Wanted ban for ${playfabId}?`)
      if (!this.isCurrent(token) || !confirmed) return null

      await this.dependencies.revert(profile.player.id, source.id)
      return this.isCurrent(token)
        ? succeeded('Wanted ban reverted.')
        : null
    })
  }

  destroy(): void {
    if (this.destroyed) return
    this.generation += 1
    this.destroyed = true
    this.active = false
    this.userId = null
    this.setRunning(null)
  }

  private async run(
    action: WantedAdminAction,
    operation: (token: number) => Promise<WantedAdminOutcome>
  ): Promise<WantedAdminOutcome> {
    if (!this.ready() || this.state.running !== null) return null
    const token = ++this.generation
    this.setRunning(action)

    try {
      return await operation(token)
    } catch (error) {
      return this.isCurrent(token)
        ? failed(error instanceof Error ? error.message : 'Wanted action failed.')
        : null
    } finally {
      if (this.isCurrent(token)) this.setRunning(null)
    }
  }

  private ready(): boolean {
    return !this.destroyed && this.active && isPositiveId(this.userId)
  }

  private isCurrent(token: number): boolean {
    return this.ready() && token === this.generation
  }

  private setRunning(running: WantedAdminAction | null): void {
    if (this.state.running === running) return
    this.state = { running }
    this.onChange(this.state)
  }
}

function defaultDependencies(): WantedAdminDependencies {
  return {
    currentGameSnapshot: () => getCoreApi().currentGameSnapshot(),
    fetchPlayerProfile,
    getWantedPlayer,
    createMock: createMockWantedAction,
    revert: revertWantedPlayer,
    confirm: message => window.confirm(message)
  }
}

function isPositiveId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function succeeded(message: string): Exclude<WantedAdminOutcome, null> {
  return { ok: true, message }
}

function failed(message: string): Exclude<WantedAdminOutcome, null> {
  return { ok: false, message }
}
