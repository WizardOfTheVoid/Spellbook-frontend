import { parsePlayerNoteContent } from '@spellbook/shared/playerNotes.js'

export type PlayerNoteDisplaySegment =
  | {
    type: `text`
    text: string
    bold?: true
    italic?: true
    strikethrough?: true
  }
  | { type: `reference`, kind: `action` | `user`, id: number }

type TextStyle = `bold` | `italic` | `strikethrough`

const delimiters = [
  { marker: `**`, style: `bold` },
  { marker: `~~`, style: `strikethrough` },
  { marker: `*`, style: `italic` },
  { marker: `_`, style: `italic` },
] as const

export function parsePlayerNoteDisplay(content: string): PlayerNoteDisplaySegment[] {
  const normalized = content
    .replace(/\r\n?/gu, `\n`)
    .replace(/ {3,}/gu, `  `)
    .replace(/\n{4,}/gu, `\n\n\n`)
  return parsePlayerNoteContent(normalized).flatMap(segment => segment.type === `text`
    ? parseMarkdownText(segment.text)
    : [segment])
}

function parseMarkdownText(text: string): PlayerNoteDisplaySegment[] {
  const segments: PlayerNoteDisplaySegment[] = []
  const active = new Map<TextStyle, string>()
  let buffer = ``

  const flush = () => {
    if (!buffer) return
    segments.push({
      type: `text`,
      text: buffer,
      ...(active.has(`bold`) ? { bold: true as const } : {}),
      ...(active.has(`italic`) ? { italic: true as const } : {}),
      ...(active.has(`strikethrough`) ? { strikethrough: true as const } : {}),
    })
    buffer = ``
  }

  for (let index = 0; index < text.length;) {
    const delimiter = delimiters.find(candidate => {
      if (!text.startsWith(candidate.marker, index)) return false
      const current = active.get(candidate.style)
      if (current) return current === candidate.marker
      return text.indexOf(candidate.marker, index + candidate.marker.length) >= 0
    })

    if (!delimiter) {
      buffer += text[index]
      index += 1
      continue
    }

    flush()
    if (active.get(delimiter.style) === delimiter.marker) active.delete(delimiter.style)
    else active.set(delimiter.style, delimiter.marker)
    index += delimiter.marker.length
  }

  flush()
  return segments
}
