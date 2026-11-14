import { readonly, writable } from 'svelte/store'
import type { DbPlayerListItem } from '$lib/core'
import type { PlayerState } from '$lib/types/playerState'

export type EvidencePlayerSelection = Omit<DbPlayerListItem, `id`> & { id: number | null }
export type EvidenceNavigationRequest = {
  sequence: number
  action: `add` | `view` | `profile`
  player: EvidencePlayerSelection
  wanted?: boolean
  candidateId?: number
}

const request = writable<EvidenceNavigationRequest | null>(null)
let sequence = 0
export const evidenceNavigationRequest = readonly(request)

export function evidencePlayerSelection(player: PlayerState): EvidencePlayerSelection {
  return player.dbPlayer ? { ...player.dbPlayer } : {
    id: player.dbId, playfabId: player.playfabId, latestName: player.name,
    lastLogin: player.lastLogin, playtimeHours: player.playtimeHours,
    activeBanKind: player.activeBanKind, isOnline: player.isOnline
  }
}

export function requestEvidenceNavigation(
  action: EvidenceNavigationRequest[`action`],
  player: EvidencePlayerSelection,
  destination: Pick<EvidenceNavigationRequest, `wanted` | `candidateId`> = {},
): void {
  request.set({ sequence: ++sequence, action, player: { ...player }, ...destination })
}

export function requestOpenPlayerReference(player: Pick<DbPlayerListItem, `id` | `playfabId` | `latestName`>): void {
  requestEvidenceNavigation(`profile`, {
    ...player, lastLogin: null, playtimeHours: null, activeBanKind: null, isOnline: false
  })
}

export function clearEvidenceNavigation(sequence: number): void {
  request.update(current => current?.sequence === sequence ? null : current)
}
