import type { PlayerTimelineTarget } from '@spellbook/shared/playerTimeline'
import { getServerApi, type EvidenceItem, type GameServerProfile, type PlayerAction } from '$lib/core'
import { unwrap } from '$lib/utils/apiResult'
import { getServer } from '$lib/utils/gameServersApi'
import { parsePlayerAction } from '$lib/utils/playerActionsApi'
import { getEvidence } from '$lib/utils/evidenceApi'

export type PlayerTimelinePreview =
  | { type: `server`, profile: GameServerProfile }
  | { type: `action`, action: PlayerAction }
  | { type: `evidence`, evidence: EvidenceItem }

type PreviewReaders = {
  server: (serverId: number) => Promise<GameServerProfile>
  action: (playerId: number, actionId: number) => Promise<PlayerAction>
  evidence?: (evidenceId: number) => Promise<EvidenceItem>
}

const readers: PreviewReaders = {
  server: serverId => getServer(serverId, { a2s: true }),
  action: async (playerId, actionId) => parsePlayerAction(await unwrap<unknown>(
    await getServerApi().playerActions.get(playerId, actionId),
    `Player action request failed.`
  ))
}

export class PlayerTimelinePreviewLoader {
  private readonly cache = new Map<string, { expiresAt: number, promise: Promise<PlayerTimelinePreview> }>()

  constructor(
    private readonly playerId: number,
    private readonly actions: () => readonly PlayerAction[],
    private readonly previewReaders: PreviewReaders = readers,
    private readonly now: () => number = Date.now
  ) {}

  async get(target: PlayerTimelineTarget): Promise<PlayerTimelinePreview> {
    if (target.type === `action`) {
      const action = this.actions().find(item => item.id === target.id)
      if (action) return { type: `action`, action }
    }

    const key = `${target.type}:${target.id}`
    const cached = this.cache.get(key)
    if (cached && cached.expiresAt > this.now()) return cached.promise

    const promise = this.read(target)
    this.cache.set(key, {
      expiresAt: target.type === `action` ? Infinity : this.now() + 30_000,
      promise
    })

    try {
      return await promise
    } catch (error) {
      if (this.cache.get(key)?.promise === promise) this.cache.delete(key)
      throw error
    }
  }

  private async read(target: PlayerTimelineTarget): Promise<PlayerTimelinePreview> {
    if (target.type === `evidence`) return {
      type: `evidence`, evidence: await (this.previewReaders.evidence ?? getEvidence)(target.id)
    }
    return target.type === `server`
      ? { type: `server`, profile: await this.previewReaders.server(target.id) }
      : { type: `action`, action: await this.previewReaders.action(this.playerId, target.id) }
  }
}
