export const playerNoteScopes = [`me`, `admins`, `public`] as const

export type PlayerNoteScope = typeof playerNoteScopes[number]

export type PlayerNoteSegment =
  | { type: `text`, text: string }
  | { type: `reference`, kind: `action` | `user`, id: number }

export type PlayerNoteReferenceIds = {
  actionIds: number[]
  userIds: number[]
}

export type PlayerNoteLabels = {
  action?: (id: number) => string | undefined
  user?: (id: number) => string | undefined
}

const referencePattern = /#\[action:([1-9]\d*)\]|@\[user:([1-9]\d*)\]/gu

export const parsePlayerNoteContent = (content: string): PlayerNoteSegment[] => {
  const segments: PlayerNoteSegment[] = []
  let textStart = 0

  for (const match of content.matchAll(referencePattern)) {
    const index = match.index
    const id = Number(match[1] ?? match[2])
    if (!Number.isSafeInteger(id)) continue

    if (index > textStart) segments.push({ type: `text`, text: content.slice(textStart, index) })
    segments.push({ type: `reference`, kind: match[1] ? `action` : `user`, id })
    textStart = index + match[0].length
  }

  if (textStart < content.length) segments.push({ type: `text`, text: content.slice(textStart) })
  return segments
}

export const serializePlayerNoteSegments = (segments: PlayerNoteSegment[]) => segments
  .map(segment => segment.type === `text`
    ? segment.text
    : segment.kind === `action` ? `#[action:${segment.id}]` : `@[user:${segment.id}]`)
  .join(``)

export const extractPlayerNoteReferenceIds = (content: string): PlayerNoteReferenceIds => {
  const actionIds = new Set<number>()
  const userIds = new Set<number>()

  for (const segment of parsePlayerNoteContent(content)) {
    if (segment.type !== `reference`) continue
    if (segment.kind === `action`) actionIds.add(segment.id)
    else userIds.add(segment.id)
  }

  return { actionIds: [...actionIds], userIds: [...userIds] }
}

export const formatPlayerNoteText = (content: string, labels: PlayerNoteLabels) => parsePlayerNoteContent(content)
  .map(segment => {
    if (segment.type === `text`) return segment.text
    if (segment.kind === `action`) return labels.action?.(segment.id) ?? `#Action ${segment.id}`
    return labels.user?.(segment.id) ?? `@User ${segment.id}`
  })
  .join(``)
