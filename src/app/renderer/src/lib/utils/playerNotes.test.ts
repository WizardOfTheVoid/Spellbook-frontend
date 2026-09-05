import assert from 'node:assert/strict'
import test from 'node:test'
import type { PlayerNote } from '$lib/core'
import {
  createPlayerNoteComposer,
  createPlayerNotesController,
  isPlayerNoteValid,
  sortPlayerNotes,
} from './playerNotes'

test(`action shortcut seeds one canonical atomic reference`, () => {
  assert.deepEqual(createPlayerNoteComposer(true, 9), {
    adding: true,
    content: `#[action:9] `,
    scope: `admins`,
  })
})

test(`accepts only trimmed note content through 1000 characters`, () => {
  assert.equal(isPlayerNoteValid(`   `), false)
  assert.equal(isPlayerNoteValid(` useful `), true)
  assert.equal(isPlayerNoteValid(`x`.repeat(1000)), true)
  assert.equal(isPlayerNoteValid(`x`.repeat(1001)), false)
})

test(`sorts player notes newest first with newest ids first on timestamp ties`, () => {
  const notes = [
    note(1, 42, `2026-09-02T10:00:00.000Z`),
    note(3, 42, `2026-09-02T11:00:00.000Z`),
    note(2, 42, `2026-09-02T11:00:00.000Z`),
  ]

  assert.deepEqual(sortPlayerNotes(notes).map(item => item.id), [3, 2, 1])
})

test(`parses requested inline Markdown without changing note references`, async () => {
  const parsePlayerNoteDisplay = await loadDisplayParser()

  assert.deepEqual(
    parsePlayerNoteDisplay(`Plain **bold** *star* _under_ ~~gone~~ #[action:9]`),
    [
      { type: `text`, text: `Plain ` },
      { type: `text`, text: `bold`, bold: true },
      { type: `text`, text: ` ` },
      { type: `text`, text: `star`, italic: true },
      { type: `text`, text: ` ` },
      { type: `text`, text: `under`, italic: true },
      { type: `text`, text: ` ` },
      { type: `text`, text: `gone`, strikethrough: true },
      { type: `text`, text: ` ` },
      { type: `reference`, kind: `action`, id: 9 },
    ],
  )
})

test(`limits rendered whitespace to two spaces and three line breaks`, async () => {
  const parsePlayerNoteDisplay = await loadDisplayParser()

  assert.deepEqual(parsePlayerNoteDisplay(`a     b\n\n\n\n\nc`), [
    { type: `text`, text: `a  b\n\n\nc` },
  ])
  assert.deepEqual(parsePlayerNoteDisplay(`a\r\n\r\n\r\n\r\nb`), [
    { type: `text`, text: `a\n\n\nb` },
  ])
})

test(`stale note loads cannot apply across player or session changes`, async () => {
  const oldLoad = deferred<PlayerNote[]>()
  const controller = createPlayerNotesController({
    list: async playerId => playerId === 42 ? await oldLoad.promise : [note(2, playerId)],
    create: async () => ({ note: note(3, 43), noteCount: 2 }),
    update: async () => ({ note: note(3, 43), noteCount: 2 }),
  })

  const firstLoad = controller.select({ playerId: 42, sessionRevision: 1 })
  await controller.select({ playerId: 43, sessionRevision: 2 })
  oldLoad.resolve([note(1, 42)])
  await firstLoad

  assert.deepEqual(controller.snapshot().notes.map(item => item.playerId), [43])
})

const note = (
  id: number,
  playerId: number,
  createdAt = `2026-09-02T10:00:00.000Z`,
): PlayerNote => ({
  id,
  playerId,
  author: { id: 3, username: `Admin`, playfabId: null },
  content: `Note ${id}`,
  scope: `admins`,
  actionReferenceIds: [],
  userReferenceIds: [],
  actionReferences: [],
  userReferences: [],
  createdAt,
  updatedAt: `2026-09-02T10:00:00.000Z`,
})

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(next => { resolve = next })
  return { promise, resolve }
}

async function loadDisplayParser(): Promise<(content: string) => unknown[]> {
  const modulePath = `./playerNoteDisplay`
  const module = await import(modulePath).catch(() => ({}))
  const parser = Reflect.get(module, `parsePlayerNoteDisplay`)
  assert.equal(typeof parser, `function`)
  return parser as (content: string) => unknown[]
}
