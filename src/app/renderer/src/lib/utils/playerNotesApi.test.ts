import assert from 'node:assert/strict'
import test from 'node:test'
import type { CoreCallResult, PlayerNote, PlayerNoteCreateInput, PlayerNoteUpdateInput } from '$lib/core'
import {
  createPlayerNote,
  fetchAllPlayerNotes,
  fetchAllUserReferences,
  parsePlayerNote,
  updatePlayerNote,
} from './playerNotesApi'

test(`player note parser keeps hydrated references`, () => {
  const parsed = parsePlayerNote(notePayload())

  assert.deepEqual(parsed.actionReferenceIds, [9])
  assert.equal(parsed.actionReferences[0]!.playerId, 42)
  assert.equal(parsed.userReferences[0]!.displayName, `Magic`)
})

test(`loads every player note and user reference page`, async () => {
  const calls: unknown[] = []
  const notes = Array.from({ length: 201 }, (_, index) => notePayload(index + 1))
  const users = Array.from({ length: 201 }, (_, index) => userPayload(index + 1))
  const api = installApi({
    listNotes: async (playerId, limit, offset) => {
      calls.push([`notes`, playerId, limit, offset])
      return result(notes.slice(offset, offset + limit))
    },
    listUsers: async (limit, offset) => {
      calls.push([`users`, limit, offset])
      return result(users.slice(offset, offset + limit))
    },
  })

  try {
    assert.equal((await fetchAllPlayerNotes(42)).length, 201)
    assert.equal((await fetchAllUserReferences()).length, 201)
    assert.deepEqual(calls, [
      [`notes`, 42, 200, 0], [`notes`, 42, 200, 200],
      [`users`, 200, 0], [`users`, 200, 200],
    ])
  } finally {
    api.restore()
  }
})

test(`creates and updates player-owned notes`, async () => {
  const calls: unknown[] = []
  const api = installApi({
    createNote: async (playerId, input) => {
      calls.push([`create`, playerId, input])
      return result({ note: notePayload(), noteCount: 4 })
    },
    updateNote: async (playerId, noteId, input) => {
      calls.push([`update`, playerId, noteId, input])
      return result({ note: notePayload(), noteCount: 4 })
    },
  })

  try {
    await createPlayerNote(42, `  #[action:9] reviewed  `, `public`)
    await updatePlayerNote(42, 3, { scope: `me` })
    assert.deepEqual(calls, [
      [`create`, 42, { content: `#[action:9] reviewed`, scope: `public` }],
      [`update`, 42, 3, { scope: `me` }],
    ])
  } finally {
    api.restore()
  }
})

type ApiOptions = {
  listNotes?: (playerId: number, limit: number, offset: number) => Promise<CoreCallResult>
  createNote?: (playerId: number, input: PlayerNoteCreateInput) => Promise<CoreCallResult>
  updateNote?: (playerId: number, noteId: number, input: PlayerNoteUpdateInput) => Promise<CoreCallResult>
  listUsers?: (limit: number, offset: number) => Promise<CoreCallResult>
}

const installApi = (options: ApiOptions) => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, `window`)
  Object.defineProperty(globalThis, `window`, {
    configurable: true,
    value: {
      chivServer: {
        playerNotes: {
          list: options.listNotes ?? (async () => result([])),
          create: options.createNote ?? (async () => result({ note: notePayload(), noteCount: 1 })),
          update: options.updateNote ?? (async () => result({ note: notePayload(), noteCount: 1 })),
        },
        userReferences: {
          list: options.listUsers ?? (async () => result([])),
          get: async () => result(userPayload()),
        },
      },
    },
  })
  return {
    restore: () => {
      if (originalWindow) Object.defineProperty(globalThis, `window`, originalWindow)
      else delete (globalThis as { window?: unknown }).window
    },
  }
}

const notePayload = (id = 3): PlayerNote => ({
  id,
  playerId: 42,
  author: { id: 3, username: `Admin`, playfabId: null },
  content: `#[action:9] reviewed @[user:7]`,
  scope: `admins`,
  actionReferenceIds: [9],
  userReferenceIds: [7],
  actionReferences: [{
    id: 9,
    playerId: 42,
    gameServerId: 2,
    authorId: 3,
    actionType: `ban`,
    offenseType: `hacker`,
    duration: 60,
    reason: `Cheating`,
    scope: `global`,
    relatedActionId: null,
    autoban: false,
    originalActionId: null,
    expiresAt: null,
    createdAt: `2026-09-02T10:00:00.000Z`,
    updatedAt: `2026-09-02T10:00:00.000Z`,
    author: { id: 3, username: `Admin`, playfabId: null },
    gameServer: { id: 2, name: `duel`, displayName: `Duel` },
  }],
  userReferences: [userPayload(7)],
  createdAt: `2026-09-02T10:00:00.000Z`,
  updatedAt: `2026-09-02T10:00:00.000Z`,
})

const userPayload = (id = 7) => ({
  id,
  username: id === 7 ? `magic` : `user${id}`,
  displayName: id === 7 ? `Magic` : `User ${id}`,
  isActive: true,
  bannedAt: null,
})

const result = <T>(data: T): CoreCallResult => ({
  ok: true,
  status: 200,
  statusText: `OK`,
  data: { ok: true, data },
})
