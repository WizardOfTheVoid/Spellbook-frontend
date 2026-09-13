import {
  getServerApi,
  type PlayerNote,
  type PlayerNoteMutation,
  type PlayerNoteScope,
  type PlayerNoteUpdateInput,
  type PlayerNoteUserReference,
} from '$lib/core'
import { unwrap } from '$lib/utils/apiResult'
import { parsePlayerAction } from './playerActionsApi'
import { isRecord, type JsonRecord } from './records'

const pageSize = 200
const noteScopes = [`me`, `admins`, `public`] as const

export async function fetchAllPlayerNotes(playerId: number): Promise<PlayerNote[]> {
  const notes: PlayerNote[] = []
  for (let offset = 0; ; offset += pageSize) {
    const value = await unwrap<unknown>(
      await getServerApi().playerNotes.list(playerId, pageSize, offset),
      `Player notes request failed.`,
    )
    const page = parsePlayerNotes(value)
    notes.push(...page)
    if (page.length < pageSize) return notes
  }
}

export async function createPlayerNote(
  playerId: number,
  content: string,
  scope: PlayerNoteScope = `admins`,
): Promise<PlayerNoteMutation> {
  const normalized = validContent(content)
  const value = await unwrap<unknown>(
    await getServerApi().playerNotes.create(playerId, { content: normalized, scope }),
    `Player note creation failed.`,
  )
  return parsePlayerNoteMutation(value)
}

export async function updatePlayerNote(
  playerId: number,
  noteId: number,
  input: PlayerNoteUpdateInput,
): Promise<PlayerNoteMutation> {
  const patch: PlayerNoteUpdateInput = {}
  if (input.content !== undefined) patch.content = validContent(input.content)
  if (input.scope !== undefined) {
    if (!noteScopes.includes(input.scope)) throw new Error(`Invalid note scope.`)
    patch.scope = input.scope
  }
  if (Object.keys(patch).length === 0) throw new Error(`At least one note field is required.`)
  const value = await unwrap<unknown>(
    await getServerApi().playerNotes.update(playerId, noteId, patch),
    `Player note update failed.`,
  )
  return parsePlayerNoteMutation(value)
}

export function parsePlayerNoteMutation(value: unknown): PlayerNoteMutation {
  const mutation = record(value)
  return {
    note: parsePlayerNote(mutation.note),
    noteCount: nonNegativeInteger(mutation.noteCount),
  }
}

export async function fetchAllUserReferences(): Promise<PlayerNoteUserReference[]> {
  const users: PlayerNoteUserReference[] = []
  for (let offset = 0; ; offset += pageSize) {
    const value = await unwrap<unknown>(
      await getServerApi().userReferences.list(pageSize, offset),
      `User references request failed.`,
    )
    const page = parseUserReferences(value)
    users.push(...page)
    if (page.length < pageSize) return users
  }
}

export async function fetchUserReference(userId: number): Promise<PlayerNoteUserReference> {
  return parseUserReference(await unwrap<unknown>(
    await getServerApi().userReferences.get(userId),
    `User reference request failed.`,
  ))
}

export function parsePlayerNote(value: unknown): PlayerNote {
  try {
    if (!isRecord(value)) throw new Error()
    const author = record(value.author)
    return {
      id: positiveInteger(value.id),
      playerId: positiveInteger(value.playerId),
      author: {
        id: positiveInteger(author.id),
        username: nullableString(author.username),
        playfabId: nullableString(author.playfabId),
      },
      content: requiredString(value.content),
      scope: enumValue(value.scope, noteScopes),
      actionReferenceIds: positiveIntegerArray(value.actionReferenceIds),
      userReferenceIds: positiveIntegerArray(value.userReferenceIds),
      actionReferences: array(value.actionReferences).map(parsePlayerAction),
      userReferences: array(value.userReferences).map(parseUserReference),
      createdAt: requiredString(value.createdAt),
      updatedAt: requiredString(value.updatedAt),
    }
  } catch {
    throw new Error(`Invalid player note data.`)
  }
}

export function parseUserReference(value: unknown): PlayerNoteUserReference {
  try {
    if (!isRecord(value)) throw new Error()
    return {
      id: positiveInteger(value.id),
      username: requiredString(value.username),
      displayName: requiredString(value.displayName),
      isActive: boolean(value.isActive),
      bannedAt: nullableString(value.bannedAt),
    }
  } catch {
    throw new Error(`Invalid user reference data.`)
  }
}

const parsePlayerNotes = (value: unknown) => array(value).map(parsePlayerNote)
const parseUserReferences = (value: unknown) => array(value).map(parseUserReference)

const validContent = (value: string) => {
  const content = value.trim()
  if (content.length < 1 || content.length > 1000) {
    throw new Error(`Note content must be between 1 and 1000 characters.`)
  }
  return content
}

const array = (value: unknown): unknown[] => {
  if (!Array.isArray(value)) throw new Error()
  return value
}

const record = (value: unknown): JsonRecord => {
  if (!isRecord(value)) throw new Error()
  return value
}

const positiveInteger = (value: unknown): number => {
  if (typeof value !== `number` || !Number.isSafeInteger(value) || value < 1) throw new Error()
  return value
}

const nonNegativeInteger = (value: unknown): number => {
  if (typeof value !== `number` || !Number.isSafeInteger(value) || value < 0) throw new Error()
  return value
}

const positiveIntegerArray = (value: unknown): number[] => array(value).map(positiveInteger)

const requiredString = (value: unknown): string => {
  if (typeof value !== `string` || value.length < 1) throw new Error()
  return value
}

const nullableString = (value: unknown): string | null => {
  if (value === null) return null
  if (typeof value !== `string`) throw new Error()
  return value
}

const boolean = (value: unknown): boolean => {
  if (typeof value !== `boolean`) throw new Error()
  return value
}

const enumValue = <const T extends readonly string[]>(value: unknown, allowed: T): T[number] => {
  if (typeof value !== `string` || !allowed.includes(value)) throw new Error()
  return value as T[number]
}
