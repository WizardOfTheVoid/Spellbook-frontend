import type { EvidenceComment } from '$lib/core'
export { formatEvidenceTime } from '@spellbook/shared/evidencePresentation'

export type TimedEvidenceComment = EvidenceComment & { positionMs: number }
export type EvidenceMarkerGroup = { percentage: number, comments: TimedEvidenceComment[] }

export function groupEvidenceComments(comments: EvidenceComment[], durationMs: number, trackWidth: number): EvidenceMarkerGroup[] {
  if (!Number.isFinite(durationMs) || durationMs <= 0 || !Number.isFinite(trackWidth) || trackWidth <= 0) return []
  const timed = comments.filter((comment): comment is TimedEvidenceComment =>
    typeof comment.positionMs === `number` && Number.isFinite(comment.positionMs) && comment.positionMs >= 0 && comment.positionMs <= durationMs
  ).sort((left, right) => left.positionMs - right.positionMs || left.id - right.id)
  const groups: EvidenceMarkerGroup[] = []
  for (const comment of timed) {
    const group = groups.at(-1)
    const first = group?.comments[0]
    if (group && first && (comment.positionMs - first.positionMs) / durationMs * trackWidth < 44) group.comments.push(comment)
    else groups.push({ percentage: comment.positionMs / durationMs * 100, comments: [comment] })
  }
  return groups
}

export function nextEvidenceMarkerComment(comments: EvidenceComment[], selectedId: number | null): EvidenceComment | null {
  if (!comments.length) return null
  return comments[(comments.findIndex(comment => comment.id === selectedId) + 1) % comments.length] ?? null
}

export function evidencePositionMs(currentTime: number, duration = Infinity): number {
  if (!Number.isFinite(currentTime)) return 0
  return Math.floor(Math.max(0, Math.min(currentTime, duration > 0 ? duration : Infinity)) * 1000)
}

export function evidenceSeekPosition(positionMs: number, durationMs: number): number | null {
  return Number.isFinite(positionMs) && positionMs >= 0 && Number.isFinite(durationMs) && durationMs > 0
    ? Math.floor(Math.min(positionMs, durationMs)) : null
}
