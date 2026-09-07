import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlayerAction, PlayerNoteUserReference } from '$lib/core'
import {
  createPlayerNoteDocument,
  filterPlayerNoteSuggestions,
  referenceDeleteRange,
  serializePlayerNoteDocument,
} from './playerNoteEditor'

const actions = [
  action(9, `warn`, `verbal_abuse`, `Bad word`),
  action(12, `ban`, `hacker`, `Bad actor`),
  action(4, `kick`, `ffa`, `Spawn killing`),
]
const users: PlayerNoteUserReference[] = [{
  id: 7,
  username: `magic`,
  displayName: `Magic`,
  isActive: true,
  bannedAt: null,
}]
const labels = { actions, users }

test(`document reconstructs and serializes atomic references`, () => {
  const document = createPlayerNoteDocument(`Hi #[action:9] @[user:7]`, labels)

  assert.deepEqual(document.content![0]!.content!.map(node => node.type), [
    `text`, `actionReference`, `text`, `userReference`,
  ])
  assert.equal(serializePlayerNoteDocument(document), `Hi #[action:9] @[user:7]`)
})

test(`suggestions filter ba and rank current player actions`, () => {
  assert.deepEqual(
    filterPlayerNoteSuggestions(`action`, `ba`, actions, users).map(item => item.id),
    [12, 9],
  )
  assert.deepEqual(
    filterPlayerNoteSuggestions(`user`, `mag`, actions, users).map(item => item.id),
    [7],
  )
  assert.deepEqual(filterPlayerNoteSuggestions(`action`, `ogabogaoga`, actions, users), [])
})

test(`empty suggestion menus identify the missing reference kind`, async () => {
  const emptyLabel = await loadSuggestionEmptyLabel()

  assert.equal(emptyLabel(`action`), `No actions found`)
  assert.equal(emptyLabel(`user`), `No users found`)
})

test(`atomic delete range removes one whole reference`, () => {
  const reference = { from: 3, to: 4, type: `actionReference` as const }

  assert.deepEqual(referenceDeleteRange({ from: 4, to: 4 }, reference, `backward`), { from: 3, to: 4 })
  assert.deepEqual(referenceDeleteRange({ from: 3, to: 3 }, reference, `forward`), { from: 3, to: 4 })
  assert.equal(referenceDeleteRange({ from: 5, to: 5 }, reference, `backward`), null)
})

test(`missing references retain canonical IDs with stable labels`, () => {
  const document = createPlayerNoteDocument(`#[action:99] @[user:88]`, labels)
  const nodes = document.content![0]!.content!

  assert.equal(nodes[0]!.attrs!.label, `Action 99`)
  assert.equal(nodes[2]!.attrs!.label, `User 88`)
  assert.equal(serializePlayerNoteDocument(document), `#[action:99] @[user:88]`)
})

function action(
  id: number,
  actionType: PlayerAction[`actionType`],
  offenseType: PlayerAction[`offenseType`],
  reason: string,
): PlayerAction {
  return {
  id,
  playerId: 42,
  gameServerId: 2,
  authorId: 3,
  actionType,
  offenseType,
  duration: null,
  reason,
  scope: `global`,
  relatedActionId: null,
  autoban: false,
  originalActionId: null,
  expiresAt: null,
  createdAt: `2026-09-02T10:00:00.000Z`,
  updatedAt: `2026-09-02T10:00:00.000Z`,
  author: { id: 3, username: `Admin`, playfabId: null },
  gameServer: { id: 2, name: `duel`, displayName: `Duel` },
  }
}

async function loadSuggestionEmptyLabel(): Promise<(kind: `action` | `user`) => string> {
  const modulePath = `./playerNoteEditor`
  const module = await import(modulePath)
  const emptyLabel = Reflect.get(module, `playerNoteSuggestionEmptyLabel`)
  assert.equal(typeof emptyLabel, `function`)
  return emptyLabel as (kind: `action` | `user`) => string
}
