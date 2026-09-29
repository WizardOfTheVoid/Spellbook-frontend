import { parsePlayerNoteContent, type PlayerNoteSegment } from '@spellbook/shared/playerNotes.js'
import type { PlayerNotePlayerReference } from '$lib/core'

export type PlayerNoteReferenceSegment = PlayerNoteSegment | { type: `reference`, kind: `player`, id: number }
export const playerReferenceName = (player: PlayerNotePlayerReference) => player.latestName?.trim() || player.playfabId

export function parsePlayerNoteReferences(content: string, includePlayers = false): PlayerNoteReferenceSegment[] {
  const segments = parsePlayerNoteContent(content)
  if (!includePlayers) return segments
  return segments.flatMap(segment => {
    if (segment.type !== `text`) return [segment]
    const result: PlayerNoteReferenceSegment[] = []
    let start = 0
    for (const match of segment.text.matchAll(/@\[player:([1-9]\d*)\]/gu)) {
      const id = Number(match[1])
      if (!Number.isSafeInteger(id)) continue
      if (match.index > start) result.push({ type: `text`, text: segment.text.slice(start, match.index) })
      result.push({ type: `reference`, kind: `player`, id })
      start = match.index + match[0].length
    }
    if (start < segment.text.length) result.push({ type: `text`, text: segment.text.slice(start) })
    return result
  })
}
