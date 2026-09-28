import type { EvidenceComment, EvidenceItem, UserSession } from '$lib/core'

type ViewerUser = Pick<UserSession, `id` | `isSuperadmin`> | null
const volumeKey = `spellbook:evidence:volume`
const validVolume = (value: number) => Number.isFinite(value) && value >= 0 && value <= 1

export function readEvidenceVolume(storage: Pick<Storage, `getItem`>): number {
  try {
    const value = storage.getItem(volumeKey)
    if (value === null || !value.trim()) return 0.5
    const volume = Number(value)
    return validVolume(volume) ? volume : 0.5
  } catch { return 0.5 }
}

export function saveEvidenceVolume(storage: Pick<Storage, `setItem`>, volume: number): void {
  if (!validVolume(volume)) return
  try { storage.setItem(volumeKey, String(volume)) }
  catch { /* Playback remains usable when storage is unavailable. */ }
}

export const canDeleteEvidence = (user: ViewerUser) => user?.isSuperadmin === true
export const canDeleteEvidenceComment = (comment: Pick<EvidenceComment, `authorId`>, user: ViewerUser) =>
  Boolean(user && (user.isSuperadmin || user.id === comment.authorId))

export function mergeEvidenceRefresh(current: EvidenceItem, refreshed: EvidenceItem, preserveOffenses: boolean, preserveComments = false): EvidenceItem {
  return {
    ...current, ...refreshed,
    offenseIds: preserveOffenses ? current.offenseIds : refreshed.offenseIds,
    commentCount: preserveComments ? current.commentCount : refreshed.commentCount,
    viewCount: Math.max(current.viewCount ?? 0, refreshed.viewCount ?? 0)
  }
}
